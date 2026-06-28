import type { ModelVersion } from '../components/ModelSelector/modelConfig';

export const DEFAULT_OLLAMA_URL = 'http://localhost:11434';

function normalizeBase(url: string): string {
  return (url || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
}

// OpenAI-compatible endpoint that the chat code points the SDK at.
export function ollamaOpenAIBase(url: string): string {
  return `${normalizeBase(url)}/v1`;
}

// List the models actually installed on the local Ollama server.
// Returns [] if Ollama isn't reachable (so callers fall back to defaults).
export async function listOllamaModels(baseUrl: string): Promise<ModelVersion[]> {
  try {
    const res = await fetch(`${normalizeBase(baseUrl)}/api/tags`, {
      method: 'GET',
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    const models = data.models ?? [];
    return models
      .map((m) => m.name)
      .filter(Boolean)
      .sort()
      .map((name) => ({ id: name, label: name }));
  } catch {
    return [];
  }
}
