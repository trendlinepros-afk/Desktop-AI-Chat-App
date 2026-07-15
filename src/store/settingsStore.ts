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
  ollamaBaseUrl: 'http://localhost:11434',
  autoMemoryEnabled: false,
  autoMemoryIntervalMinutes: 30,
  grokApiKey: '',
  grokModel: 'grok-3',
  rpMemoryEnabled: true,
  rpSummarizeEvery: 20,
  rpVaultPath: '',
  rpAutoReplyLimit: 3,
  projectBoardPath: '',
  webPortalEnabled: true,
  webPortalPort: 8967,
  webPortalToken: '',
  sttModel: 'gpt-4o-mini-transcribe',
  ttsModel: 'gpt-4o-mini-tts',
  ttsVoice: 'alloy',
  dataRootPath: '',
  comfyUrl: 'http://127.0.0.1:8188',
  comfyCheckpoint: '',
  comfyModelFamily: '',
  comfyWorkflow: '',
  comfyLaunchPath: '',
  fluxGymPath: '',
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
