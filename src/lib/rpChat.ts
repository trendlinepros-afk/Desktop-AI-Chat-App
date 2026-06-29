import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/index';
import { withRetry } from './retry';

// The Role-Play side talks to the Grok (xAI) API. Grok is OpenAI-compatible, so
// we drive it with the OpenAI SDK pointed at xAI's base URL. This is kept fully
// separate from the main app's model plumbing (useChat) on purpose.

export const GROK_BASE_URL = 'https://api.x.ai/v1';

// Sensible defaults shown before (or instead of) a live fetch from the key.
export const GROK_MODELS = ['grok-4', 'grok-3', 'grok-3-mini', 'grok-2-latest', 'grok-beta'];

function client(apiKey: string): OpenAI {
  return new OpenAI({ apiKey, baseURL: GROK_BASE_URL, dangerouslyAllowBrowser: true });
}

export interface RPTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Stream a reply from Grok, calling onToken with the cumulative text each chunk.
export async function streamGrok(
  apiKey: string,
  model: string,
  messages: RPTurn[],
  onToken: (full: string) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!apiKey) throw new Error('No Grok API key set. Add one in RP settings.');
  const stream = await withRetry(() =>
    client(apiKey).chat.completions.create({
      model,
      messages: messages as ChatCompletionMessageParam[],
      stream: true,
    })
  );
  let full = '';
  for await (const chunk of stream) {
    if (signal?.aborted) break;
    full += chunk.choices[0]?.delta?.content || '';
    onToken(full);
  }
  return full;
}

// One-shot (non-streaming) completion — used to summarize a conversation into
// the persona's long-term memory file.
export async function completeGrok(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  if (!apiKey) throw new Error('No Grok API key set.');
  const res = await withRetry(() =>
    client(apiKey).chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
    })
  );
  return res.choices[0]?.message?.content ?? '';
}

// List the chat models the Grok key can actually call (via the main process to
// dodge CORS). Falls back to the curated defaults if the call fails.
export async function listGrokModels(apiKey: string): Promise<string[]> {
  if (!apiKey) return GROK_MODELS;
  try {
    const ids = await window.polyglot.listOpenAICompatModels(GROK_BASE_URL, apiKey);
    const chat = ids.filter((id) => !/embed|image|vision/i.test(id));
    return chat.length > 0 ? chat.sort() : GROK_MODELS;
  } catch {
    return GROK_MODELS;
  }
}
