import { useCallback } from 'react';
import OpenAI from 'openai';
import type { Message, Settings, VaultNote } from '../types';
import type { InjectedNote } from '../store/brainStore';

const EMBED_MODEL = 'text-embedding-3-small';

export async function embedText(apiKey: string, text: string): Promise<number[]> {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8000),
  });
  return res.data[0].embedding;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function lastUserText(messages: Message[], n: number): string {
  return messages
    .filter((m) => m.role === 'user')
    .slice(-n)
    .flatMap((m) => m.content.filter((p) => p.type === 'text').map((p) => p.text || ''))
    .join(' ');
}

export interface BrainContextResult {
  systemText: string | null;
  injected: InjectedNote[];
}

export function useVaultSearch() {
  // Returns a system-message text block + the list of injected notes, or null context.
  const buildBrainContext = useCallback(
    async (messages: Message[], settings: Settings): Promise<BrainContextResult> => {
      const query = lastUserText(messages, 3);
      if (!query.trim()) return { systemText: null, injected: [] };

      // Step 1: keyword search via main process.
      const keywordHits = await window.polyglot.vaultSearch(query);
      const merged = new Map<string, VaultNote>();
      for (const note of keywordHits.slice(0, 5)) merged.set(note.path, note);

      // Step 2: semantic search (only when an OpenAI key + indexing are available).
      if (settings.openaiApiKey && settings.semanticIndexingEnabled) {
        try {
          const embeddings = await window.polyglot.vaultGetEmbeddings();
          const paths = Object.keys(embeddings);
          if (paths.length > 0) {
            const queryEmbedding = await embedText(settings.openaiApiKey, query);
            const scored = paths
              .map((p) => ({ path: p, score: cosineSimilarity(queryEmbedding, embeddings[p]) }))
              .sort((a, b) => b.score - a.score)
              .slice(0, 3)
              .filter((s) => s.score > 0.2);

            const allNotes = await window.polyglot.vaultReadAll();
            const byPath = new Map(allNotes.map((n) => [n.path, n]));
            for (const s of scored) {
              const note = byPath.get(s.path);
              if (note && !merged.has(note.path)) merged.set(note.path, note);
            }
          }
        } catch (err) {
          console.warn('Semantic search failed, keyword only:', err);
        }
      }

      // Step 3: merge + take top 4, build injection block.
      const top = Array.from(merged.values()).slice(0, 4);
      if (top.length === 0) return { systemText: null, injected: [] };

      const blocks = top
        .map((n) => `[Note: ${n.path}]\n${n.body.slice(0, 2000)}`)
        .join('\n\n');
      const systemText = `=== Master Brain Context ===\nThe following notes from your knowledge vault are relevant to this conversation:\n\n${blocks}\n=== End Brain Context ===`;

      return {
        systemText,
        injected: top.map((n) => ({ path: n.path, title: n.title })),
      };
    },
    []
  );

  return { buildBrainContext };
}
