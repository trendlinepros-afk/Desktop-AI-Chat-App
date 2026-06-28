import { create } from 'zustand';
import type { Settings } from '../types';

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  save: (partial: Partial<Settings>) => Promise<void>;
}

const EMPTY: Settings = {
  openaiApiKey: '',
  geminiApiKey: '',
  deepseekApiKey: '',
  vaultPath: '',
  defaultProvider: 'openai',
  defaultModelVersion: 'gpt-4o',
  semanticIndexingEnabled: true,
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: EMPTY,
  loaded: false,
  load: async () => {
    const settings = await window.polyglot.getSettings();
    set({ settings, loaded: true });
  },
  save: async (partial) => {
    await window.polyglot.saveSettings(partial);
    set({ settings: { ...get().settings, ...partial } });
  },
}));
