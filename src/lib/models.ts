import OpenAI from 'openai';
import type { Provider, Settings } from '../types';
import type { ModelVersion } from '../components/ModelSelector/modelConfig';

// Live model discovery. Instead of a hardcoded list, ask each provider's API
// which models the user's key can actually call — so new models show up the
// moment the provider ships them, and models the key can't reach don't.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiModel {
  name: string; // e.g. "models/gemini-2.5-pro"
  displayName?: string;
  supportedGenerationMethods?: string[];
}

// Cache per key for the session — the model list doesn't change minute to minute.
const geminiCache = new Map<string, GeminiModel[]>();

async function fetchGeminiModels(apiKey: string): Promise<GeminiModel[]> {
  const cached = geminiCache.get(apiKey);
  if (cached) return cached;
  const res = await fetch(`${GEMINI_BASE}?pageSize=1000`, {
    headers: { 'x-goog-api-key': apiKey },
  });
  if (!res.ok) throw new Error(`Gemini ListModels failed (${res.status})`);
  const data = (await res.json()) as { models?: GeminiModel[] };
  const models = data.models ?? [];
  geminiCache.set(apiKey, models);
  return models;
}

// Numeric-aware descending sort so newer versions float to the top
// (e.g. "3.5" before "2.5", "gemini-2.5-pro" before "gemini-1.5-flash").
function byNewest(a: ModelVersion, b: ModelVersion): number {
  return b.id.localeCompare(a.id, undefined, { numeric: true, sensitivity: 'base' });
}

function geminiChatModels(models: GeminiModel[]): ModelVersion[] {
  const out: ModelVersion[] = [];
  for (const m of models) {
    const methods = m.supportedGenerationMethods ?? [];
    if (!methods.includes('generateContent')) continue;
    const id = m.name.replace(/^models\//, '');
    // Drop non-chat models: embeddings, image generation, answer-quality, tts.
    if (/embedding|imagen|aqa|-tts|image-generation|-image-preview|-image$/i.test(id)) continue;
    out.push({ id, label: m.displayName || id });
  }
  return out.sort(byNewest);
}

// Image-capable Gemini/Imagen models discovered on the key (for the Image Gen
// dropdown). Mirrors the discovery used by generateImage().
function geminiImageModels(models: GeminiModel[]): ModelVersion[] {
  const out: ModelVersion[] = [];
  for (const m of models) {
    const id = m.name.replace(/^models\//, '');
    const methods = m.supportedGenerationMethods ?? [];
    const isImagen = /imagen/.test(id) && methods.includes('predict');
    const isGeminiImage = /image/.test(id) && methods.includes('generateContent') && !/vision/.test(id);
    if (isImagen || isGeminiImage) out.push({ id, label: m.displayName || id });
  }
  return out;
}

// OpenAI-compatible (OpenAI + DeepSeek) — GET /v1/models, then keep the chat
// models and drop embeddings / audio / image / moderation / legacy completions.
async function listOpenAICompatModels(
  apiKey: string,
  baseURL: string | undefined
): Promise<ModelVersion[]> {
  const client = new OpenAI({ apiKey, baseURL, dangerouslyAllowBrowser: true });
  const res = await client.models.list();
  const out: ModelVersion[] = [];
  for (const m of res.data) {
    const id = m.id;
    if (
      /embed|whisper|tts|dall-e|audio|image|realtime|moderation|transcrib|search|similarity|\bedit\b|babbage|davinci|ada|curie|instruct/i.test(
        id
      )
    ) {
      continue;
    }
    out.push({ id, label: id });
  }
  return out.sort(byNewest);
}

// List the chat-capable models the given provider's key can actually call.
// Ollama is handled separately (its models live on the local server).
export async function listChatModels(provider: Provider, settings: Settings): Promise<ModelVersion[]> {
  switch (provider) {
    case 'gemini':
      return geminiChatModels(await fetchGeminiModels(settings.geminiApiKey));
    case 'openai':
      return listOpenAICompatModels(settings.openaiApiKey, undefined);
    case 'deepseek':
      return listOpenAICompatModels(settings.deepseekApiKey, 'https://api.deepseek.com');
    case 'ollama':
      return [];
  }
}

// List the image-generation models the Gemini key can actually call.
export async function listImageModels(apiKey: string): Promise<ModelVersion[]> {
  return geminiImageModels(await fetchGeminiModels(apiKey));
}
