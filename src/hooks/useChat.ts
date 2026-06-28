import { useCallback, useRef, useState } from 'react';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { Content } from '@google/generative-ai';
import type { ContentPart, Message, Provider, Settings } from '../types';

export interface SendOptions {
  provider: Provider;
  modelVersion: string;
  settings: Settings;
  // Full assembled history: brain context + linked context + chat history + new user message.
  messages: Message[];
  onToken: (full: string) => void;
  signal?: AbortSignal;
}

// ---------- Message format adapters ----------

function partsToText(parts: ContentPart[]): string {
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('\n');
}

function formatForOpenAI(messages: Message[]): ChatCompletionMessageParam[] {
  return messages.map((m) => {
    if (m.role === 'system') {
      return { role: 'system', content: partsToText(m.content) };
    }
    if (m.role === 'assistant') {
      return { role: 'assistant', content: partsToText(m.content) };
    }
    // user — may include images
    const hasImage = m.content.some((p) => p.type === 'image_url' && p.image_url?.url);
    if (!hasImage) {
      return { role: 'user', content: partsToText(m.content) };
    }
    const content = m.content
      .map((p) => {
        if (p.type === 'text' && p.text) {
          return { type: 'text' as const, text: p.text };
        }
        if (p.type === 'image_url' && p.image_url?.url) {
          return { type: 'image_url' as const, image_url: { url: p.image_url.url } };
        }
        return null;
      })
      .filter(Boolean) as ChatCompletionMessageParam['content'];
    return { role: 'user', content } as ChatCompletionMessageParam;
  });
}

function dataUrlToInline(url: string): { mimeType: string; data: string } | null {
  const match = /^data:([^;]+);base64,(.*)$/.exec(url);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function formatForGemini(messages: Message[]): { system?: string; contents: Content[] } {
  let system: string | undefined;
  const contents: Content[] = [];
  for (const m of messages) {
    if (m.role === 'system') {
      system = (system ? system + '\n\n' : '') + partsToText(m.content);
      continue;
    }
    const role = m.role === 'assistant' ? 'model' : 'user';
    const parts: Content['parts'] = [];
    for (const p of m.content) {
      if (p.type === 'text' && p.text) parts.push({ text: p.text });
      if (p.type === 'image_url' && p.image_url?.url) {
        const inline = dataUrlToInline(p.image_url.url);
        if (inline) parts.push({ inlineData: inline });
      }
    }
    if (parts.length === 0) parts.push({ text: '' });
    contents.push({ role, parts });
  }
  return { system, contents };
}

// ---------- Streaming senders ----------

async function streamOpenAICompatible(
  apiKey: string,
  baseURL: string | undefined,
  opts: SendOptions
): Promise<string> {
  const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });

  // Pull any MCP tools the user has configured. When present we run a
  // (non-streaming) tool-calling loop so the model can drive external tools
  // — e.g. a Godot editor MCP server — before producing its final answer.
  let mcpTools: import('../types').McpToolInfo[] = [];
  try {
    mcpTools = (await window.polyglot?.mcpListTools?.()) ?? [];
  } catch {
    mcpTools = [];
  }

  if (mcpTools.length > 0) {
    return runToolLoop(client, opts, mcpTools);
  }

  const stream = await client.chat.completions.create({
    model: opts.modelVersion,
    messages: formatForOpenAI(opts.messages),
    stream: true,
  });
  let full = '';
  for await (const chunk of stream) {
    if (opts.signal?.aborted) break;
    full += chunk.choices[0]?.delta?.content || '';
    opts.onToken(full);
  }
  return full;
}

async function runToolLoop(
  client: OpenAI,
  opts: SendOptions,
  mcpTools: import('../types').McpToolInfo[]
): Promise<string> {
  const tools = mcpTools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.qualifiedName,
      description: `[${t.serverName}] ${t.description}`,
      parameters: t.inputSchema as Record<string, unknown>,
    },
  }));

  const messages = formatForOpenAI(opts.messages) as ChatCompletionMessageParam[];
  const MAX_ROUNDS = 6;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (opts.signal?.aborted) break;
    const res = await client.chat.completions.create({
      model: opts.modelVersion,
      messages,
      tools,
      tool_choice: 'auto',
    });
    const choice = res.choices[0]?.message;
    if (!choice) break;

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      messages.push(choice);
      opts.onToken(`🛠️ Running ${choice.tool_calls.length} tool call(s)…`);
      for (const call of choice.tool_calls) {
        if (call.type !== 'function') continue;
        let result: string;
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          result = await window.polyglot.mcpCallTool(call.function.name, args);
        } catch (err) {
          result = `Error calling tool: ${(err as Error).message}`;
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: result });
      }
      continue; // let the model react to the tool results
    }

    const text = choice.content ?? '';
    opts.onToken(text);
    return text;
  }
  return 'Tool loop ended without a final response.';
}

async function streamGemini(apiKey: string, opts: SendOptions): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const { system, contents } = formatForGemini(opts.messages);
  const model = genAI.getGenerativeModel({
    model: opts.modelVersion,
    ...(system ? { systemInstruction: system } : {}),
  });
  const result = await model.generateContentStream({ contents });
  let full = '';
  for await (const chunk of result.stream) {
    if (opts.signal?.aborted) break;
    full += chunk.text();
    opts.onToken(full);
  }
  return full;
}

export async function generateImage(
  apiKey: string,
  modelVersion: string,
  prompt: string
): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  // The Imagen models are accessed via a generative model handle.
  const model = genAI.getGenerativeModel({ model: modelVersion });
  // @ts-expect-error generateImages exists on Imagen-capable models in the SDK runtime.
  const result = await model.generateImages({
    prompt,
    numberOfImages: 1,
    aspectRatio: '1:1',
  });
  const base64 = result?.generatedImages?.[0]?.image?.imageBytes;
  if (!base64) throw new Error('No image returned from Imagen');
  return `data:image/png;base64,${base64}`;
}

function keyFor(provider: Provider, settings: Settings): string {
  switch (provider) {
    case 'openai':
      return settings.openaiApiKey;
    case 'gemini':
      return settings.geminiApiKey;
    case 'deepseek':
      return settings.deepseekApiKey;
  }
}

export function useChat() {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(async (opts: SendOptions): Promise<string> => {
    const apiKey = keyFor(opts.provider, opts.settings);
    if (!apiKey) {
      throw new Error(`No API key set for ${opts.provider}. Add one in Settings.`);
    }
    setError(null);
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;
    const withSignal = { ...opts, signal: controller.signal };
    try {
      switch (opts.provider) {
        case 'openai':
          return await streamOpenAICompatible(apiKey, undefined, withSignal);
        case 'deepseek':
          return await streamOpenAICompatible(
            apiKey,
            'https://api.deepseek.com',
            withSignal
          );
        case 'gemini':
          return await streamGemini(apiKey, withSignal);
      }
    } catch (err) {
      const message = (err as Error).message || 'Request failed';
      setError(message);
      throw err;
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, []);

  return { sendMessage, stop, isStreaming, error };
}

// Lightweight non-streaming completion for summaries / category / idea detection.
export async function completeText(
  provider: Provider,
  modelVersion: string,
  settings: Settings,
  prompt: string
): Promise<string> {
  const apiKey = keyFor(provider, settings);
  if (!apiKey) throw new Error(`No API key set for ${provider}.`);
  if (provider === 'gemini') {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelVersion });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }
  const baseURL = provider === 'deepseek' ? 'https://api.deepseek.com' : undefined;
  const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
  const res = await client.chat.completions.create({
    model: modelVersion,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices[0]?.message?.content ?? '';
}
