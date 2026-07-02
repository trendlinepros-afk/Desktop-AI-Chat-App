import { create } from 'zustand';
import type { AgentPersona } from '../types';

interface AgentState {
  personas: AgentPersona[];
  managerOpen: boolean;
  load: () => Promise<void>;
  setManagerOpen: (open: boolean) => void;
  create: (data: {
    name: string;
    avatar?: string;
    systemPrompt: string;
    vaultPath: string;
  }) => Promise<AgentPersona>;
  update: (
    id: string,
    patch: Partial<Pick<AgentPersona, 'name' | 'avatar' | 'systemPrompt' | 'vaultPath'>>
  ) => Promise<void>;
  remove: (id: string) => Promise<void>;
  byId: (id: string | null) => AgentPersona | undefined;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  personas: [],
  managerOpen: false,
  byId: (id) => (id ? get().personas.find((p) => p.id === id) : undefined),
  setManagerOpen: (open) => set({ managerOpen: open }),
  load: async () => set({ personas: await window.polyglot.agentGetPersonas() }),
  create: async (data) => {
    const persona = await window.polyglot.agentCreatePersona(data);
    await get().load();
    return persona;
  },
  update: async (id, patch) => {
    await window.polyglot.agentUpdatePersona(id, patch);
    await get().load();
  },
  remove: async (id) => {
    await window.polyglot.agentDeletePersona(id);
    await get().load();
  },
}));
