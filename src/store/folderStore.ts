import { create } from 'zustand';
import type { Folder } from '../types';

interface FolderState {
  folders: Folder[];
  expanded: Record<string, boolean>;
  load: () => Promise<void>;
  createFolder: (name: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  toggleExpanded: (id: string) => void;
}

export const useFolderStore = create<FolderState>((set, get) => ({
  folders: [],
  expanded: {},
  load: async () => {
    const folders = await window.polyglot.getFolders();
    set({ folders });
  },
  createFolder: async (name) => {
    const folder = await window.polyglot.createFolder(name);
    set({ folders: [...get().folders, folder], expanded: { ...get().expanded, [folder.id]: true } });
    return folder;
  },
  renameFolder: async (id, name) => {
    await window.polyglot.renameFolder(id, name);
    set({ folders: get().folders.map((f) => (f.id === id ? { ...f, name } : f)) });
  },
  deleteFolder: async (id) => {
    await window.polyglot.deleteFolder(id);
    set({ folders: get().folders.filter((f) => f.id !== id) });
  },
  toggleExpanded: (id) =>
    set({ expanded: { ...get().expanded, [id]: !get().expanded[id] } }),
}));
