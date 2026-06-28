export type Provider = 'openai' | 'gemini' | 'deepseek';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface Chat {
  id: string;
  title: string;
  folderId: string | null; // null = uncategorized
  provider: Provider;
  modelVersion: string;
  createdAt: number;
  updatedAt: number;
}

export interface ContentPart {
  type: 'text' | 'image_url' | 'file';
  text?: string;
  image_url?: { url: string }; // base64 data URL
  name?: string;
  mime?: string;
  data?: string; // base64 for non-image files
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: ContentPart[];
  createdAt: number;
}

export interface VaultNote {
  path: string; // relative to vault root
  title: string;
  category: string;
  tags: string[];
  date: string;
  body: string;
  status?: string;
  embedding?: number[]; // stored in .embeddings.json sidecar
}

export interface MemoryReview {
  summary: string;
  keyPoints: string[];
  ideas: string[];
  openQuestions: string[];
  tags: string[];
  category: string;
}

export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  enabled: boolean;
}

export interface McpToolInfo {
  serverId: string;
  serverName: string;
  name: string;
  qualifiedName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface UpdateCheckResult {
  current: string;
  latest: string | null;
  hasUpdate: boolean;
  url: string;
  error?: string;
}

export interface Settings {
  openaiApiKey: string;
  geminiApiKey: string;
  deepseekApiKey: string;
  vaultPath: string;
  defaultProvider: Provider;
  defaultModelVersion: string;
  semanticIndexingEnabled: boolean;
}

export const VAULT_CATEGORIES = [
  'Ideas',
  'Projects',
  'Workflows',
  'Decisions',
  'People',
  'Reference',
  'Uncategorized',
] as const;

export type VaultCategory = (typeof VAULT_CATEGORIES)[number];

// The API surface exposed on window.polyglot via the preload contextBridge.
export interface WickedAPI {
  // Chats
  getChats(): Promise<Chat[]>;
  createChat(data: {
    title?: string;
    folderId?: string | null;
    provider: Provider;
    modelVersion: string;
  }): Promise<Chat>;
  updateChatTitle(id: string, title: string): Promise<void>;
  updateChatFolder(id: string, folderId: string | null): Promise<void>;
  updateChatModel(id: string, provider: Provider, modelVersion: string): Promise<void>;
  deleteChat(id: string): Promise<void>;

  // Folders
  getFolders(): Promise<Folder[]>;
  createFolder(name: string): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<void>;
  deleteFolder(id: string): Promise<void>;

  // Messages
  getMessages(chatId: string): Promise<Message[]>;
  saveMessage(msg: {
    id?: string;
    chatId: string;
    role: Message['role'];
    content: ContentPart[];
  }): Promise<Message>;

  // Chat links
  getChatLinks(chatId: string): Promise<string[]>;
  addChatLink(sourceChatId: string, linkedChatId: string): Promise<void>;
  removeChatLink(sourceChatId: string, linkedChatId: string): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  saveSettings(partial: Partial<Settings>): Promise<void>;

  // File dialogs
  openFileDialog(): Promise<{ name: string; mime: string; data: string } | null>;
  openVaultFolderDialog(): Promise<string | null>;

  // Vault operations
  vaultReadAll(): Promise<VaultNote[]>;
  vaultWriteNote(category: string, filename: string, content: string): Promise<string>;
  vaultReadNote(path: string): Promise<string>;
  vaultSearch(query: string): Promise<VaultNote[]>;
  vaultGetEmbeddings(): Promise<Record<string, number[]>>;
  vaultSaveEmbedding(path: string, embedding: number[]): Promise<void>;
  vaultRegenerateIndex(): Promise<void>;

  // Export
  exportMarkdown(filename: string, content: string): Promise<string | null>;
  exportPDF(filename: string, html: string): Promise<string | null>;

  // MCP servers
  mcpGetServers(): Promise<McpServerConfig[]>;
  mcpSaveServers(servers: McpServerConfig[]): Promise<void>;
  mcpListTools(): Promise<McpToolInfo[]>;
  mcpCallTool(qualifiedName: string, args: Record<string, unknown>): Promise<string>;
  mcpTestServer(server: McpServerConfig): Promise<{ ok: boolean; tools: number; error?: string }>;
  mcpDisconnect(id: string): Promise<void>;

  // Updates
  getAppVersion(): Promise<string>;
  checkForUpdates(): Promise<UpdateCheckResult>;

  // Shell
  openExternal(path: string): Promise<void>;
}

declare global {
  interface Window {
    polyglot: WickedAPI;
  }
}
