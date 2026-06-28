import { create } from 'zustand';
import type { VaultNote } from '../types';

export interface InjectedNote {
  path: string;
  title: string;
}

interface BrainState {
  panelOpen: boolean;
  notes: VaultNote[];
  searchResults: VaultNote[];
  // Notes injected into the active chat's last send, keyed by chatId.
  activeContext: Record<string, InjectedNote[]>;

  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  loadNotes: () => Promise<void>;
  search: (query: string) => Promise<void>;
  setActiveContext: (chatId: string, notes: InjectedNote[]) => void;
}

export const useBrainStore = create<BrainState>((set, get) => ({
  panelOpen: false,
  notes: [],
  searchResults: [],
  activeContext: {},

  togglePanel: () => set({ panelOpen: !get().panelOpen }),
  setPanelOpen: (open) => set({ panelOpen: open }),

  loadNotes: async () => {
    const notes = await window.polyglot.vaultReadAll();
    set({ notes });
  },

  search: async (query) => {
    const results = await window.polyglot.vaultSearch(query);
    set({ searchResults: results });
  },

  setActiveContext: (chatId, notes) =>
    set({ activeContext: { ...get().activeContext, [chatId]: notes } }),
}));
