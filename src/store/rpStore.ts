import { create } from 'zustand';
import type { RPMessage, RPPersona } from '../types';
import { useSettingsStore } from './settingsStore';
import { useUIStore } from './uiStore';
import { streamGrok, completeGrok, type RPTurn } from '../lib/rpChat';

// How much recent raw history to send each turn. Older turns are preserved in
// the persona's memory file rather than the prompt, keeping context bounded.
const MAX_HISTORY = 30;
// Cap how much of the (growing) memory file we inject as context.
const MAX_MEMORY_CHARS = 6000;

interface RPState {
  personas: RPPersona[];
  activePersonaId: string | null;
  messages: RPMessage[];
  streamingText: string;
  isStreaming: boolean;
  summarizing: boolean;

  loadPersonas: () => Promise<void>;
  selectPersona: (id: string | null) => Promise<void>;
  createPersona: (data: {
    name: string;
    description: string;
    avatar?: string;
    greeting?: string;
    model: string;
  }) => Promise<RPPersona>;
  updatePersona: (
    id: string,
    patch: Partial<Pick<RPPersona, 'name' | 'description' | 'avatar' | 'greeting' | 'model'>>
  ) => Promise<void>;
  deletePersona: (id: string) => Promise<void>;
  clearConversation: (id: string) => Promise<void>;
  send: (text: string) => Promise<void>;
  stop: () => void;
  summarizeNow: (id: string) => Promise<void>;
}

let abort: AbortController | null = null;

// Build the system prompt that gives Grok the persona's character + its memory.
function buildSystem(persona: RPPersona, memory: string): RPTurn {
  let text =
    `You are role-playing as "${persona.name}". Stay fully in character at all times, ` +
    `speaking in the first person as ${persona.name}. Never break character or mention that ` +
    `you are an AI.\n\nCharacter:\n${persona.description.trim()}`;
  if (memory.trim()) {
    const trimmed =
      memory.length > MAX_MEMORY_CHARS ? memory.slice(memory.length - MAX_MEMORY_CHARS) : memory;
    text +=
      `\n\nLong-term memory of your shared history (earlier conversations were summarized here ` +
      `so you don't forget — treat it as things you remember):\n${trimmed.trim()}`;
  }
  return { role: 'system', content: text };
}

export const useRPStore = create<RPState>((set, get) => ({
  personas: [],
  activePersonaId: null,
  messages: [],
  streamingText: '',
  isStreaming: false,
  summarizing: false,

  loadPersonas: async () => {
    const personas = await window.polyglot.rpGetPersonas();
    set({ personas });
  },

  selectPersona: async (id) => {
    set({ activePersonaId: id, messages: [], streamingText: '' });
    if (id) {
      const messages = await window.polyglot.rpGetMessages(id);
      if (get().activePersonaId === id) set({ messages });
    }
  },

  createPersona: async (data) => {
    const persona = await window.polyglot.rpCreatePersona(data);
    set({ personas: [persona, ...get().personas], activePersonaId: persona.id, messages: [] });
    // Seed the conversation with the persona's opening line, if any.
    if (persona.greeting.trim()) {
      const msg = await window.polyglot.rpSaveMessage({
        personaId: persona.id,
        role: 'assistant',
        content: persona.greeting.trim(),
      });
      if (get().activePersonaId === persona.id) set({ messages: [msg] });
    }
    return persona;
  },

  updatePersona: async (id, patch) => {
    await window.polyglot.rpUpdatePersona(id, patch);
    set({
      personas: get().personas.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    });
  },

  deletePersona: async (id) => {
    await window.polyglot.rpDeletePersona(id);
    const personas = get().personas.filter((p) => p.id !== id);
    set({
      personas,
      activePersonaId: get().activePersonaId === id ? null : get().activePersonaId,
      messages: get().activePersonaId === id ? [] : get().messages,
    });
  },

  clearConversation: async (id) => {
    await window.polyglot.rpClearMessages(id);
    await window.polyglot.rpClearMemory(id);
    set({
      personas: get().personas.map((p) => (p.id === id ? { ...p, summarizedCount: 0 } : p)),
      messages: get().activePersonaId === id ? [] : get().messages,
    });
  },

  send: async (text) => {
    const persona = get().personas.find((p) => p.id === get().activePersonaId);
    if (!persona || !text.trim() || get().isStreaming) return;
    const settings = useSettingsStore.getState().settings;
    const toast = useUIStore.getState().toast;

    // Only touch the visible message list / streaming bubble while this persona
    // is still the active one — the user may switch personas mid-stream.
    const isActive = () => get().activePersonaId === persona.id;

    const userMsg = await window.polyglot.rpSaveMessage({
      personaId: persona.id,
      role: 'user',
      content: text.trim(),
    });
    set({ messages: [...get().messages, userMsg], streamingText: '', isStreaming: true });

    const memory = await window.polyglot.rpReadMemory(persona.id).catch(() => '');
    const history = get().messages.slice(-MAX_HISTORY);
    const turns: RPTurn[] = [
      buildSystem(persona, memory),
      ...history.map((m) => ({ role: m.role, content: m.content }) as RPTurn),
    ];

    abort = new AbortController();
    let finalText = '';
    try {
      finalText = await streamGrok(
        settings.grokApiKey,
        persona.model,
        turns,
        (full) => {
          if (isActive()) set({ streamingText: full });
        },
        abort.signal
      );
    } catch (err) {
      finalText = get().streamingText || `⚠️ ${(err as Error).message}`;
      toast((err as Error).message, 'error');
    } finally {
      abort = null;
    }

    const assistantMsg = await window.polyglot.rpSaveMessage({
      personaId: persona.id,
      role: 'assistant',
      content: finalText,
    });
    if (isActive()) {
      set({ messages: [...get().messages, assistantMsg], streamingText: '', isStreaming: false });
    } else {
      set({ streamingText: '', isStreaming: false });
    }

    // Once enough new messages have accrued, fold them into long-term memory so
    // the next prompts stay small without forgetting what happened.
    if (settings.rpMemoryEnabled) {
      const total = get().messages.length;
      if (total - persona.summarizedCount >= settings.rpSummarizeEvery) {
        void get().summarizeNow(persona.id);
      }
    }
  },

  stop: () => {
    abort?.abort();
    abort = null;
    set({ isStreaming: false });
  },

  summarizeNow: async (id) => {
    const persona = get().personas.find((p) => p.id === id);
    if (!persona || get().summarizing) return;
    const settings = useSettingsStore.getState().settings;
    if (!settings.grokApiKey) return;

    const all = await window.polyglot.rpGetMessages(id);
    const fresh = all.slice(persona.summarizedCount);
    if (fresh.length === 0) return;

    set({ summarizing: true });
    try {
      const transcript = fresh
        .map((m) => `${m.role === 'user' ? 'User' : persona.name}: ${m.content}`)
        .join('\n');
      const prompt =
        `You maintain the long-term memory for a role-played character named "${persona.name}".\n` +
        `Summarize the conversation below into durable memory: key facts established, events that ` +
        `happened, decisions made, the user's stated preferences/details, and how the relationship ` +
        `or mood evolved. Write terse third-person bullet points. Omit small talk. Keep only what ` +
        `would matter in future conversations.\n\nConversation:\n${transcript}`;
      const summary = await completeGrok(settings.grokApiKey, persona.model, prompt);
      if (summary.trim()) {
        await window.polyglot.rpAppendMemory(id, persona.name, summary);
        await window.polyglot.rpSetSummarized(id, all.length);
        set({
          personas: get().personas.map((p) =>
            p.id === id ? { ...p, summarizedCount: all.length } : p
          ),
        });
      }
    } catch (err) {
      console.warn('RP summarize failed:', (err as Error).message);
    } finally {
      set({ summarizing: false });
    }
  },
}));
