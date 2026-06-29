import { useCallback, useRef, useState } from 'react';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import type { Content } from '@google/generative-ai';
import type { ContentPart, Message, Provider, Settings } from '../types';
import { ollamaOpenAIBase } from '../lib/ollama';
import { withRetry } from '../lib/retry';
import { useStreamStore, beginStream, endStream, abortCurrentStream } from '../store/streamStore';

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
    .map((p) => {
      if (p.type === 'text' && p.text) return p.text;
      // Include extracted text from attached documents so the model can read them.
      if (p.type === 'file' && p.text) return `\n[Attached file: ${p.name ?? 'file'}]\n${p.text}`;
      return '';
    })
    .filter(Boolean)
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
        if (p.type === 'file' && p.text) {
          return { type: 'text' as const, text: `[Attached file: ${p.name ?? 'file'}]\n${p.text}` };
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
      if (p.type === 'file' && p.text) {
        parts.push({ text: `[Attached file: ${p.name ?? 'file'}]\n${p.text}` });
      }
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

  const stream = await withRetry(() =>
    client.chat.completions.create({
      model: opts.modelVersion,
      messages: formatForOpenAI(opts.messages),
      stream: true,
    })
  );
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
  let lastText = '';

  for (let round = 0; round < MAX_ROUNDS; round++) {
    if (opts.signal?.aborted) break;
    const res = await withRetry(() =>
      client.chat.completions.create({
        model: opts.modelVersion,
        messages,
        tools,
        tool_choice: 'auto',
      })
    );
    const choice = res.choices[0]?.message;
    if (!choice) break;

    // The model may emit prose alongside tool calls — keep the latest non-empty text.
    if (choice.content) lastText = choice.content;

    if (choice.tool_calls && choice.tool_calls.length > 0) {
      messages.push(choice);
      const note = `${lastText ? lastText + '\n\n' : ''}🛠️ Running ${choice.tool_calls.length} tool call(s)…`;
      opts.onToken(note);
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
  // Ran out of rounds (or aborted) — return whatever prose we last saw.
  return lastText || 'Tool loop ended without a final response.';
}

async function streamGemini(apiKey: string, opts: SendOptions): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const { system, contents } = formatForGemini(opts.messages);
  const model = genAI.getGenerativeModel({
    model: opts.modelVersion,
    ...(system ? { systemInstruction: system } : {}),
  });
  const result = await withRetry(() => model.generateContentStream({ contents }));
  let full = '';
  for await (const chunk of result.stream) {
    if (opts.signal?.aborted) break;
    full += chunk.text();
    opts.onToken(full);
  }
  return full;
}

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Image models to try, in order. Gemini-native image generation (generateContent
// with an IMAGE modality) works on standard paid Gemini API keys; Imagen via
// :predict is often not enabled, so it's the last resort.
const IMAGE_FALLBACKS = [
  'gemini-2.0-flash-preview-image-generation',
  'gemini-2.5-flash-image-preview',
  'imagen-3.0-generate-002',
];

async function errorDetail(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: { message?: string } };
    return j?.error?.message || '';
  } catch {
    return (await res.text().catch(() => '')) || '';
  }
}

// Gemini-native image generation via generateContent (responseModalities: IMAGE).
async function geminiGenerateImage(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  if (!res.ok) throw new Error(`${model} (${res.status}): ${(await errorDetail(res)).slice(0, 160)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  };
  const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error(`${model}: no image in response`);
  return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
}

// Imagen via the :predict endpoint.
async function imagenPredict(apiKey: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(`${GEMINI_BASE}/${model}:predict`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
  });
  if (!res.ok) throw new Error(`${model} (${res.status}): ${(await errorDetail(res)).slice(0, 160)}`);
  const data = (await res.json()) as { predictions?: { bytesBase64Encoded?: string; mimeType?: string }[] };
  const pred = data.predictions?.[0];
  if (!pred?.bytesBase64Encoded) throw new Error(`${model}: no image returned`);
  return `data:${pred.mimeType || 'image/png'};base64,${pred.bytesBase64Encoded}`;
}

// Try the preferred model, then fallbacks, until one returns an image. Returns
// the data URL and the model that actually worked.
export async function generateImage(
  apiKey: string,
  preferredModel: string,
  prompt: string
): Promise<{ url: string; model: string }> {
  const order: string[] = [];
  for (const m of [preferredModel, ...IMAGE_FALLBACKS]) {
    if (m && !order.includes(m)) order.push(m);
  }
  const errors: string[] = [];
  for (const model of order) {
    try {
      const url = model.startsWith('imagen')
        ? await imagenPredict(apiKey, model, prompt)
        : await geminiGenerateImage(apiKey, model, prompt);
      return { url, model };
    } catch (err) {
      errors.push((err as Error).message);
    }
  }
  throw new Error(
    `No image model available on this key. Tried: ${errors.join(' | ')}. Image generation needs a paid/billing-enabled Gemini key.`
  );
}

function keyFor(provider: Provider, settings: Settings): string {
  switch (provider) {
    case 'openai':
      return settings.openaiApiKey;
    case 'gemini':
      return settings.geminiApiKey;
    case 'deepseek':
      return settings.deepseekApiKey;
    case 'ollama':
      // Local Ollama needs no key; the SDK still wants a non-empty string.
      return 'ollama';
  }
}

export function useChat() {
  const [error, setError] = useState<string | null>(null);
  // Streaming state + abort live in a shared store so the input box and
  // per-message regenerate/edit all reflect the same in-flight request.
  const isStreaming = useStreamStore((s) => s.isStreaming);

  const stop = useCallback(() => {
    abortCurrentStream();
  }, []);

  const sendMessage = useCallback(async (opts: SendOptions): Promise<string> => {
    const apiKey = keyFor(opts.provider, opts.settings);
    if (!apiKey) {
      throw new Error(`No API key set for ${opts.provider}. Add one in Settings.`);
    }
    setError(null);
    const controller = beginStream();
    const withSignal = { ...opts, signal: controller.signal };
    try {
      switch (opts.provider) {
        case 'openai':
          return await streamOpenAICompatible(apiKey, undefined, withSignal);
        case 'deepseek':
          return await streamOpenAICompatible(apiKey, 'https://api.deepseek.com', withSignal);
        case 'ollama':
          return await streamOpenAICompatible(
            apiKey,
            ollamaOpenAIBase(opts.settings.ollamaBaseUrl),
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
      endStream(controller);
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
    const result = await withRetry(() => model.generateContent(prompt));
    return result.response.text();
  }
  const baseURL =
    provider === 'deepseek'
      ? 'https://api.deepseek.com'
      : provider === 'ollama'
        ? ollamaOpenAIBase(settings.ollamaBaseUrl)
        : undefined;
  const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
  const res = await withRetry(() =>
    client.chat.completions.create({
      model: modelVersion,
      messages: [{ role: 'user', content: prompt }],
    })
  );
  return res.choices[0]?.message?.content ?? '';
}
