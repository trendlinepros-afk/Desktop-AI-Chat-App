import { create } from 'zustand';
import type { RPMessage, RPPersona, RPScene } from '../types';
import { useSettingsStore } from './settingsStore';
import { useUIStore } from './uiStore';
import { grokComplete, type RPTurn } from '../lib/rpChat';

// How much recent raw history to send each turn. Older turns are preserved in
// the scene's memory file rather than the prompt, keeping context bounded.
const MAX_HISTORY = 30;
const MAX_MEMORY_CHARS = 6000;

interface RPState {
  personas: RPPersona[];
  scenes: RPScene[];
  activeSceneId: string | null;
  memberIds: string[]; // personas participating in the active scene
  messages: RPMessage[];
  generating: boolean;
  speakingId: string | null; // which persona is currently composing a reply
  summarizing: boolean;

  loadPersonas: () => Promise<void>;
  loadScenes: () => Promise<void>;
  selectScene: (id: string | null) => Promise<void>;

  createPersona: (data: {
    name: string;
    description: string;
    avatar?: string;
    greeting?: string;
    model: string;
    isMe?: boolean;
  }) => Promise<RPPersona>;
  updatePersona: (
    id: string,
    patch: Partial<Pick<RPPersona, 'name' | 'description' | 'avatar' | 'greeting' | 'model' | 'isMe'>>
  ) => Promise<void>;
  deletePersona: (id: string) => Promise<void>;

  createScene: (name: string, personaIds: string[]) => Promise<RPScene>;
  renameScene: (id: string, name: string) => Promise<void>;
  deleteScene: (id: string) => Promise<void>;
  setMembers: (sceneId: string, personaIds: string[]) => Promise<void>;
  clearScene: (id: string) => Promise<void>;

  sendUser: (text: string) => Promise<void>;
  haveSpeak: (personaId: string) => Promise<void>;
  stop: () => void;
  summarizeNow: (sceneId: string) => Promise<void>;

  mePersona: () => RPPersona | undefined;
  personaById: (id: string | null) => RPPersona | undefined;
}

let cancelled = false;

export const useRPStore = create<RPState>((set, get) => ({
  personas: [],
  scenes: [],
  activeSceneId: null,
  memberIds: [],
  messages: [],
  generating: false,
  speakingId: null,
  summarizing: false,

  mePersona: () => get().personas.find((p) => p.isMe),
  personaById: (id) => (id ? get().personas.find((p) => p.id === id) : undefined),

  loadPersonas: async () => set({ personas: await window.polyglot.rpGetPersonas() }),
  loadScenes: async () => set({ scenes: await window.polyglot.rpGetScenes() }),

  selectScene: async (id) => {
    set({ activeSceneId: id, messages: [], memberIds: [] });
    if (id) {
      const [messages, memberIds] = await Promise.all([
        window.polyglot.rpGetSceneMessages(id),
        window.polyglot.rpGetSceneMembers(id),
      ]);
      if (get().activeSceneId === id) set({ messages, memberIds });
    }
  },

  createPersona: async (data) => {
    const persona = await window.polyglot.rpCreatePersona(data);
    await get().loadPersonas();
    return persona;
  },

  updatePersona: async (id, patch) => {
    await window.polyglot.rpUpdatePersona(id, patch);
    await get().loadPersonas();
  },

  deletePersona: async (id) => {
    await window.polyglot.rpDeletePersona(id);
    await get().loadPersonas();
    set({ memberIds: get().memberIds.filter((m) => m !== id) });
  },

  createScene: async (name, personaIds) => {
    const scene = await window.polyglot.rpCreateScene(name, personaIds);
    await get().loadScenes();
    set({ activeSceneId: scene.id, memberIds: personaIds, messages: [] });
    // Seed each participant's opening line, in order.
    for (const pid of personaIds) {
      const p = get().personaById(pid);
      if (p && !p.isMe && p.greeting.trim()) {
        const msg = await window.polyglot.rpSaveSceneMessage({
          sceneId: scene.id,
          senderPersonaId: p.id,
          content: p.greeting.trim(),
        });
        if (get().activeSceneId === scene.id) set({ messages: [...get().messages, msg] });
      }
    }
    return scene;
  },

  renameScene: async (id, name) => {
    await window.polyglot.rpRenameScene(id, name);
    await get().loadScenes();
  },

  deleteScene: async (id) => {
    await window.polyglot.rpDeleteScene(id);
    await get().loadScenes();
    if (get().activeSceneId === id) set({ activeSceneId: null, messages: [], memberIds: [] });
  },

  setMembers: async (sceneId, personaIds) => {
    await window.polyglot.rpSetSceneMembers(sceneId, personaIds);
    if (get().activeSceneId === sceneId) set({ memberIds: personaIds });
  },

  clearScene: async (id) => {
    await window.polyglot.rpClearScene(id);
    set({
      scenes: get().scenes.map((s) => (s.id === id ? { ...s, summarizedCount: 0 } : s)),
      messages: get().activeSceneId === id ? [] : get().messages,
    });
  },

  sendUser: async (text) => {
    const sceneId = get().activeSceneId;
    if (!sceneId || !text.trim() || get().generating) return;
    const me = get().mePersona();
    const userMsg = await window.polyglot.rpSaveSceneMessage({
      sceneId,
      senderPersonaId: me?.id ?? null,
      content: text.trim(),
    });
    set({ messages: [...get().messages, userMsg] });
    await respondRound(get, set, sceneId);
  },

  haveSpeak: async (personaId) => {
    const sceneId = get().activeSceneId;
    const persona = get().personaById(personaId);
    if (!sceneId || !persona || get().generating) return;
    cancelled = false;
    set({ generating: true });
    await generateFor(get, set, sceneId, persona);
    set({ generating: false, speakingId: null });
    await maybeSummarize(get);
  },

  stop: () => {
    cancelled = true;
    set({ generating: false, speakingId: null });
  },

  summarizeNow: async (sceneId) => {
    const scene = get().scenes.find((s) => s.id === sceneId);
    if (!scene || get().summarizing) return;
    const settings = useSettingsStore.getState().settings;
    if (!settings.grokApiKey) return;

    const all = await window.polyglot.rpGetSceneMessages(sceneId);
    const fresh = all.slice(scene.summarizedCount);
    if (fresh.length === 0) return;

    set({ summarizing: true });
    try {
      const transcript = fresh.map((m) => `${speakerName(get, m)}: ${m.content}`).join('\n');
      const prompt =
        `You maintain the long-term memory for a role-played group conversation.\n` +
        `Summarize the exchange below into durable memory: key facts established, events that ` +
        `happened, decisions made, each participant's stated details/preferences, and how the ` +
        `relationships or mood evolved. Write terse third-person bullet points. Omit small talk. ` +
        `Keep only what would matter in future conversations.\n\nConversation:\n${transcript}`;
      const summary = await grokComplete(settings.grokApiKey, settings.grokModel, [
        { role: 'user', content: prompt },
      ]);
      if (summary.trim()) {
        await window.polyglot.rpAppendMemory(sceneId, scene.name, summary);
        await window.polyglot.rpSetSceneSummarized(sceneId, all.length);
        set({
          scenes: get().scenes.map((s) =>
            s.id === sceneId ? { ...s, summarizedCount: all.length } : s
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

type Get = () => RPState;
type Set = (partial: Partial<RPState>) => void;

// Display name for whoever sent a message (a persona, or "you" for typed lines).
function speakerName(get: Get, m: RPMessage): string {
  if (m.senderPersonaId === null) return get().mePersona()?.name ?? 'You';
  return get().personaById(m.senderPersonaId)?.name ?? 'Someone';
}

// Run one round: every non-"me" participant replies once, in order, each seeing
// the replies that came before it this turn.
async function respondRound(get: Get, set: Set, sceneId: string): Promise<void> {
  const aiMembers = get()
    .memberIds.map((id) => get().personaById(id))
    .filter((p): p is RPPersona => !!p && !p.isMe);
  if (aiMembers.length === 0) return;
  cancelled = false;
  set({ generating: true });
  for (const p of aiMembers) {
    if (cancelled || get().activeSceneId !== sceneId) break;
    await generateFor(get, set, sceneId, p);
  }
  set({ generating: false, speakingId: null });
  await maybeSummarize(get);
}

// Build the prompt for one persona and append its reply to the scene.
async function generateFor(get: Get, set: Set, sceneId: string, persona: RPPersona): Promise<void> {
  const settings = useSettingsStore.getState().settings;
  const toast = useUIStore.getState().toast;
  set({ speakingId: persona.id });

  const memory = await window.polyglot.rpReadMemory(sceneId).catch(() => '');
  const me = get().mePersona();
  const others = get()
    .memberIds.map((id) => get().personaById(id))
    .filter((p): p is RPPersona => !!p && p.id !== persona.id && !p.isMe);

  let system =
    `You are "${persona.name}". Stay fully in character, speaking in the first person as ` +
    `${persona.name}. Never break character or mention that you are an AI.\n\n` +
    `Character:\n${persona.description.trim()}`;
  if (others.length > 0) {
    system +=
      `\n\nThis is a group conversation. Other characters present: ` +
      others.map((o) => o.name).join(', ') +
      `. Reply ONLY as ${persona.name}, with a single message. Do not write, narrate, or ` +
      `speak for the other characters or the user. Do not prefix your reply with your name.`;
  }
  if (me) {
    system += `\n\nYou are talking with ${me.name}${
      me.description.trim() ? `, who is: ${me.description.trim()}` : ''
    }.`;
  }
  if (memory.trim()) {
    const trimmed =
      memory.length > MAX_MEMORY_CHARS ? memory.slice(memory.length - MAX_MEMORY_CHARS) : memory;
    system +=
      `\n\nLong-term memory of this conversation's history (earlier turns were summarized here so ` +
      `you don't forget — treat it as things you remember):\n${trimmed.trim()}`;
  }

  const history = get().messages.slice(-MAX_HISTORY);
  const turns: RPTurn[] = [{ role: 'system', content: system }];
  for (const m of history) {
    if (m.senderPersonaId === persona.id) {
      turns.push({ role: 'assistant', content: m.content });
    } else {
      turns.push({ role: 'user', content: `${speakerName(get, m)}: ${m.content}` });
    }
  }

  let text = '';
  try {
    text = await grokComplete(settings.grokApiKey, persona.model, turns);
  } catch (err) {
    text = `⚠️ ${(err as Error).message}`;
    toast((err as Error).message, 'error');
  }

  const msg = await window.polyglot.rpSaveSceneMessage({
    sceneId,
    senderPersonaId: persona.id,
    content: text,
  });
  if (get().activeSceneId === sceneId) set({ messages: [...get().messages, msg] });
}

async function maybeSummarize(get: Get): Promise<void> {
  const sceneId = get().activeSceneId;
  if (!sceneId) return;
  const settings = useSettingsStore.getState().settings;
  if (!settings.rpMemoryEnabled) return;
  const scene = get().scenes.find((s) => s.id === sceneId);
  if (!scene) return;
  if (get().messages.length - scene.summarizedCount >= settings.rpSummarizeEvery) {
    void get().summarizeNow(sceneId);
  }
}
