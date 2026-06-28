import { create } from 'zustand';
import type { Chat, Message, Provider } from '../types';

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  messages: Message[];
  brainEnabled: Record<string, boolean>; // per-chat Brain toggle
  imageGenMode: Record<string, boolean>; // per-chat image gen toggle

  loadChats: () => Promise<void>;
  selectChat: (id: string | null) => Promise<void>;
  createChat: (provider: Provider, modelVersion: string, folderId?: string | null) => Promise<Chat>;
  renameChat: (id: string, title: string) => Promise<void>;
  moveChat: (id: string, folderId: string | null) => Promise<void>;
  setChatModel: (id: string, provider: Provider, modelVersion: string) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;

  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  updateLastAssistant: (content: Message['content']) => void;

  toggleBrain: (chatId: string) => void;
  setImageGen: (chatId: string, on: boolean) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  activeChatId: null,
  messages: [],
  brainEnabled: {},
  imageGenMode: {},

  loadChats: async () => {
    const chats = await window.polyglot.getChats();
    set({ chats });
  },

  selectChat: async (id) => {
    set({ activeChatId: id, messages: [] });
    if (id) {
      const messages = await window.polyglot.getMessages(id);
      // Guard against a race if user switched chats while loading.
      if (get().activeChatId === id) set({ messages });
    }
  },

  createChat: async (provider, modelVersion, folderId = null) => {
    const chat = await window.polyglot.createChat({ provider, modelVersion, folderId });
    set({
      chats: [chat, ...get().chats],
      activeChatId: chat.id,
      messages: [],
      brainEnabled: { ...get().brainEnabled, [chat.id]: true },
    });
    return chat;
  },

  renameChat: async (id, title) => {
    await window.polyglot.updateChatTitle(id, title);
    set({ chats: get().chats.map((c) => (c.id === id ? { ...c, title } : c)) });
  },

  moveChat: async (id, folderId) => {
    await window.polyglot.updateChatFolder(id, folderId);
    set({ chats: get().chats.map((c) => (c.id === id ? { ...c, folderId } : c)) });
  },

  setChatModel: async (id, provider, modelVersion) => {
    await window.polyglot.updateChatModel(id, provider, modelVersion);
    set({
      chats: get().chats.map((c) => (c.id === id ? { ...c, provider, modelVersion } : c)),
    });
  },

  deleteChat: async (id) => {
    await window.polyglot.deleteChat(id);
    const remaining = get().chats.filter((c) => c.id !== id);
    set({
      chats: remaining,
      activeChatId: get().activeChatId === id ? null : get().activeChatId,
      messages: get().activeChatId === id ? [] : get().messages,
    });
  },

  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set({ messages: [...get().messages, message] }),
  updateLastAssistant: (content) => {
    const messages = [...get().messages];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') {
        messages[i] = { ...messages[i], content };
        break;
      }
    }
    set({ messages });
  },

  toggleBrain: (chatId) =>
    set({
      brainEnabled: {
        ...get().brainEnabled,
        [chatId]: !(get().brainEnabled[chatId] ?? true),
      },
    }),

  setImageGen: (chatId, on) =>
    set({ imageGenMode: { ...get().imageGenMode, [chatId]: on } }),
}));
