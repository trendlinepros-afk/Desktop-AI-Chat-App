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
  disabledIds: string[]; // members muted in the active scene (cannot speak)
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
    avatarImage?: string;
    greeting?: string;
    model: string;
    isMe?: boolean;
  }) => Promise<RPPersona>;
  updatePersona: (
    id: string,
    patch: Partial<
      Pick<
        RPPersona,
        'name' | 'description' | 'avatar' | 'avatarImage' | 'greeting' | 'model' | 'isMe' | 'avatarRotateDaily'
      >
    >
  ) => Promise<void>;
  deletePersona: (id: string) => Promise<void>;

  createScene: (name: string, personaIds: string[]) => Promise<RPScene>;
  renameScene: (id: string, name: string) => Promise<void>;
  deleteScene: (id: string) => Promise<void>;
  setMembers: (sceneId: string, personaIds: string[]) => Promise<void>;
  addPersonToScene: (personaId: string) => Promise<void>;
  setMemberEnabled: (personaId: string, enabled: boolean) => Promise<void>;
  clearScene: (id: string) => Promise<void>;

  sendUser: (text: string) => Promise<void>;
  guideScene: (text: string) => Promise<void>;
  haveSpeak: (personaId: string) => Promise<void>;
  stop: () => void;
  summarizeNow: (sceneId: string) => Promise<void>;
  syncFromVault: () => Promise<void>;
  editMessage: (id: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  regenerateLast: () => Promise<void>;

  mePersona: () => RPPersona | undefined;
  personaById: (id: string | null) => RPPersona | undefined;
}

let cancelled = false;

export const useRPStore = create<RPState>((set, get) => ({
  personas: [],
  scenes: [],
  activeSceneId: null,
  memberIds: [],
  disabledIds: [],
  messages: [],
  generating: false,
  speakingId: null,
  summarizing: false,

  mePersona: () => get().personas.find((p) => p.isMe),
  personaById: (id) => (id ? get().personas.find((p) => p.id === id) : undefined),

  loadPersonas: async () => set({ personas: await window.polyglot.rpGetPersonas() }),
  loadScenes: async () => set({ scenes: await window.polyglot.rpGetScenes() }),

  selectScene: async (id) => {
    set({ activeSceneId: id, messages: [], memberIds: [], disabledIds: [] });
    if (id) {
      const [messages, memberIds, disabledIds] = await Promise.all([
        window.polyglot.rpGetSceneMessages(id),
        window.polyglot.rpGetSceneMembers(id),
        window.polyglot.rpGetSceneDisabled(id),
      ]);
      if (get().activeSceneId === id) set({ messages, memberIds, disabledIds });
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

  addPersonToScene: async (personaId) => {
    const sceneId = get().activeSceneId;
    const persona = get().personaById(personaId);
    if (!sceneId || !persona) return;
    if (get().memberIds.includes(personaId)) return;
    const members = [...get().memberIds, personaId];
    await window.polyglot.rpSetSceneMembers(sceneId, members);
    set({ memberIds: members });
    // A new arrival "enters" with a single line — but only if it's a character
    // (not your own "me" persona) and nothing is already generating.
    if (!persona.isMe && !get().generating) {
      cancelled = false;
      set({ generating: true });
      await generateFor(get, set, sceneId, persona, `*${persona.name} joins the conversation.*`);
      set({ generating: false, speakingId: null });
      await maybeSummarize(get);
    }
  },

  setMemberEnabled: async (personaId, enabled) => {
    const sceneId = get().activeSceneId;
    if (!sceneId) return;
    await window.polyglot.rpSetMemberEnabled(sceneId, personaId, enabled);
    const disabled = new Set(get().disabledIds);
    if (enabled) disabled.delete(personaId);
    else disabled.add(personaId);
    set({ disabledIds: [...disabled] });
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
    await runAuto(get, set, sceneId, text.trim());
  },

  // An out-of-character "director" steer (mood change, plot direction). It's
  // recorded as a director note and the characters then continue, following it.
  guideScene: async (text) => {
    const sceneId = get().activeSceneId;
    if (!sceneId || !text.trim() || get().generating) return;
    const msg = await window.polyglot.rpSaveSceneMessage({
      sceneId,
      senderPersonaId: null,
      content: text.trim(),
      kind: 'director',
    });
    set({ messages: [...get().messages, msg] });
    await runAuto(get, set, sceneId, text.trim());
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

  syncFromVault: async () => {
    const sceneId = get().activeSceneId;
    if (!sceneId) return;
    const settings = useSettingsStore.getState().settings;
    const toast = useUIStore.getState().toast;
    if (!settings.rpVaultPath) {
      toast('No RP vault configured — choose one in RP Settings', 'error');
      return;
    }
    const res = await window.polyglot.rpSyncFromVault(sceneId);
    await get().loadPersonas();
    toast(
      res.updated > 0
        ? `Synced ${res.updated} persona(s) and memory from the vault`
        : 'Conversation is already up to date with the vault',
      'success'
    );
  },

  editMessage: async (id, content) => {
    await window.polyglot.rpUpdateSceneMessage(id, content);
    set({ messages: get().messages.map((m) => (m.id === id ? { ...m, content } : m)) });
  },

  deleteMessage: async (id) => {
    await window.polyglot.rpDeleteSceneMessage(id);
    set({ messages: get().messages.filter((m) => m.id !== id) });
  },

  // Re-roll the most recent character line (delete it and let that same
  // character respond again).
  regenerateLast: async () => {
    const sceneId = get().activeSceneId;
    if (!sceneId || get().generating) return;
    const msgs = get().messages;
    const last = msgs[msgs.length - 1];
    if (!last) return;
    const persona = get().personaById(last.senderPersonaId);
    if (!persona || persona.isMe) return; // only re-roll a character's line
    await window.polyglot.rpDeleteSceneMessage(last.id);
    set({ messages: msgs.slice(0, -1), generating: true });
    cancelled = false;
    await generateFor(get, set, sceneId, persona);
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

// The characters allowed to speak in the active scene: members that aren't you
// and aren't muted via their checkbox.
const aiMembersOf = (get: Get): RPPersona[] => {
  const disabled = new Set(get().disabledIds);
  return get()
    .memberIds.map((id) => get().personaById(id))
    .filter((p): p is RPPersona => !!p && !p.isMe && !disabled.has(p.id));
};

// The character whose name appears in `text` (used to route who replies next).
function findAddressed(text: string, candidates: RPPersona[]): RPPersona | undefined {
  const lower = text.toLowerCase();
  return candidates.find((p) => lower.includes(p.name.toLowerCase()));
}

// Heuristic: does this reply put a question to the USER (not another character)?
// If so we stop the auto-banter and wait — the other characters shouldn't answer
// on your behalf.
function addressedToUser(text: string, me: RPPersona | undefined, others: RPPersona[]): boolean {
  if (!/\?/.test(text)) return false;
  const lower = text.toLowerCase();
  const mentionsOther = others.some((p) => lower.includes(p.name.toLowerCase()));
  const mentionsMe = !!me && lower.includes(me.name.toLowerCase());
  if (mentionsOther && !mentionsMe) return false; // the question is for another character
  return true; // a question, aimed at you (by name, or with no other target)
}

// The driver for automatic replies. After you speak, characters reply one at a
// time — addressing each other by name to build the story — until the safety
// limit is hit, someone asks YOU a question, or you press Stop. A lone character
// just answers once.
async function runAuto(get: Get, set: Set, sceneId: string, userText: string): Promise<void> {
  const aiMembers = aiMembersOf(get);
  if (aiMembers.length === 0) return;
  const limit = Math.max(1, useSettingsStore.getState().settings.rpAutoReplyLimit);
  const me = get().mePersona();

  cancelled = false;
  set({ generating: true });

  // First responder: whoever you named, else the first character.
  let next: RPPersona | undefined = findAddressed(userText, aiMembers) ?? aiMembers[0];
  let count = 0;
  while (next && count < limit && !cancelled && get().activeSceneId === sceneId) {
    const speaker: RPPersona = next;
    const reply = await generateFor(get, set, sceneId, speaker);
    count++;
    const others = aiMembers.filter((p) => p.id !== speaker.id);
    if (others.length === 0) break; // solo character — no back-and-forth
    if (addressedToUser(reply, me, others)) break; // they asked you something
    // Continue: the character they named, else round-robin to the next one.
    next = findAddressed(reply, others) ?? nextInOrder(aiMembers, speaker);
  }

  set({ generating: false, speakingId: null });
  await maybeSummarize(get);
}

function nextInOrder(members: RPPersona[], current: RPPersona): RPPersona | undefined {
  if (members.length < 2) return undefined;
  const idx = members.findIndex((p) => p.id === current.id);
  return members[(idx + 1) % members.length];
}

// Build the prompt for one persona, append its reply to the scene, return the
// reply text. `nudge` injects a stage direction (e.g. a character entering).
async function generateFor(
  get: Get,
  set: Set,
  sceneId: string,
  persona: RPPersona,
  nudge?: string
): Promise<string> {
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
    `Character:\n${persona.description.trim()}\n\n` +
    `Write in an immersive, novel-like role-play style — never dialogue only. Narrate ` +
    `${persona.name}'s actions, body language, expressions, and the scene/setting in the third ` +
    `person wrapped in *asterisks*, and write spoken words as plain text. Every reply must include ` +
    `at least one *narration* of what ${persona.name} is doing or how the scene looks, not just ` +
    `speech.\nFor example:\n*Beth walks into the room, confident, wearing a pink shirt and skirt, ` +
    `and smiles* Hello Adam, how are you?\n\n` +
    `Crucially, PROGRESS the story every turn. Do not repeat, echo, or paraphrase what you or ` +
    `another character already said. React to the latest message, then add something NEW — a fresh ` +
    `action, decision, question, revelation, or change in the scene that moves things forward. ` +
    `Never stall, agree-and-restate, or loop back to earlier points. Keep replies fairly short ` +
    `(1-4 sentences) to keep momentum.`;
  if (others.length > 0) {
    system +=
      `\n\nThis is a live group conversation. Other characters present: ` +
      others.map((o) => o.name).join(', ') +
      `. Reply ONLY as ${persona.name}, with a single short message. Do not write, narrate, or ` +
      `speak for anyone else. Do not prefix your reply with your name. You may speak to another ` +
      `character by addressing them by name, or speak to ${me ? me.name : 'the user'} directly. ` +
      `If you want ${me ? me.name : 'the user'}'s input, ask them a direct question by name; ` +
      `otherwise keep the scene moving with the other characters.`;
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
    if (m.kind === 'director') {
      turns.push({
        role: 'user',
        content: `[DIRECTOR — out-of-character instruction, you MUST follow this to steer the scene]: ${m.content}`,
      });
    } else if (m.senderPersonaId === persona.id) {
      turns.push({ role: 'assistant', content: m.content });
    } else {
      turns.push({ role: 'user', content: `${speakerName(get, m)}: ${m.content}` });
    }
  }
  if (nudge) turns.push({ role: 'user', content: nudge });

  let text = '';
  try {
    // Higher temperature + repetition penalties keep characters from echoing each
    // other and looping — they push the model toward fresh, progressing replies.
    text = await grokComplete(settings.grokApiKey, persona.model, turns, {
      temperature: 0.95,
      presencePenalty: 0.6,
      frequencyPenalty: 0.5,
    });
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
  return text;
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
