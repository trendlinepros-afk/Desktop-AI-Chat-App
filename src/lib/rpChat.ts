// The Role-Play side talks to the Grok (xAI) API. The actual HTTP call runs in
// the Electron MAIN process (see rp:grokComplete) — a direct fetch from the
// renderer to api.x.ai is blocked by CORS and surfaces as a bare
// "Connection error", so everything here funnels through the preload bridge.

export const GROK_BASE_URL = 'https://api.x.ai/v1';

// Sensible defaults shown before (or instead of) a live fetch from the key.
export const GROK_MODELS = ['grok-4', 'grok-3', 'grok-3-mini', 'grok-2-latest', 'grok-beta'];

export interface RPTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GrokOptions {
  temperature?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
}

// One Grok completion (non-streaming). Used for both persona replies and the
// memory summaries.
export async function grokComplete(
  apiKey: string,
  model: string,
  messages: RPTurn[],
  options?: GrokOptions
): Promise<string> {
  return window.polyglot.rpGrokComplete(apiKey, model, messages, options);
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
