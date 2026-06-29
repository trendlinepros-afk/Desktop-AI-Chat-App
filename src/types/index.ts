export type Provider = 'openai' | 'gemini' | 'deepseek' | 'ollama';

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
  systemPrompt: string;
  noMemory: boolean; // opt out of scheduled auto-commit to memory
  lastCommittedAt: number; // when this chat was last saved to the vault
}

export interface DeletedChat extends Chat {
  deletedAt: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  body: string;
  createdAt: number;
}

export interface MessageSearchHit {
  chatId: string;
  chatTitle: string;
  messageId: string;
  role: string;
  snippet: string;
  createdAt: number;
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
  // The model that produced this message (assistant messages), so the bubble
  // tag is stable even if the chat's model is later changed.
  provider?: Provider;
  modelVersion?: string;
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
  ollamaBaseUrl: string; // e.g. http://localhost:11434
  autoMemoryEnabled: boolean; // periodically commit chats to memory
  autoMemoryIntervalMinutes: number; // how often the scheduler runs
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
  updateChatSystemPrompt(id: string, prompt: string): Promise<void>;
  branchChat(id: string, uptoCreatedAt: number): Promise<Chat | null>;
  setChatNoMemory(id: string, noMemory: boolean): Promise<void>;
  setChatCommitted(id: string, ts: number): Promise<void>;
  getDeletedChats(): Promise<DeletedChat[]>;
  restoreChat(id: string): Promise<void>;
  purgeChat(id: string): Promise<void>;

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
    provider?: Provider;
    modelVersion?: string;
  }): Promise<Message>;
  deleteMessage(id: string): Promise<void>;
  deleteMessagesFrom(chatId: string, createdAt: number): Promise<void>;
  searchMessages(query: string): Promise<MessageSearchHit[]>;

  // Prompt templates
  getTemplates(): Promise<PromptTemplate[]>;
  saveTemplate(name: string, body: string): Promise<PromptTemplate>;
  deleteTemplate(id: string): Promise<void>;

  // Chat links
  getChatLinks(chatId: string): Promise<string[]>;
  addChatLink(sourceChatId: string, linkedChatId: string): Promise<void>;
  removeChatLink(sourceChatId: string, linkedChatId: string): Promise<void>;

  // Settings
  getSettings(): Promise<Settings>;
  saveSettings(partial: Partial<Settings>): Promise<void>;

  // File dialogs
  openFileDialog(): Promise<{ name: string; mime: string; data: string; text?: string } | null>;
  openVaultFolderDialog(): Promise<string | null>;

  // Vault operations
  vaultReadAll(): Promise<VaultNote[]>;
  vaultWriteNote(category: string, filename: string, content: string): Promise<string>;
  vaultWriteNoteForChat(
    category: string,
    filename: string,
    content: string,
    sourceChatId: string
  ): Promise<string>;
  vaultReadNote(path: string): Promise<string>;
  vaultSearch(query: string): Promise<VaultNote[]>;
  vaultGetEmbeddings(): Promise<Record<string, number[]>>;
  vaultSaveEmbedding(path: string, embedding: number[]): Promise<void>;
  vaultRegenerateIndex(): Promise<void>;
  vaultGitStatus(): Promise<{ isRepo: boolean; hasRemote: boolean; branch: string; dirtyCount: number }>;
  vaultGitSync(message: string): Promise<string>;

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
  installUpdate(): Promise<string>;

  // Model discovery (OpenAI/DeepSeek listed in the main process to avoid CORS)
  listOpenAICompatModels(baseUrl: string, apiKey: string): Promise<string[]>;

  // Shell
  openExternal(path: string): Promise<void>;
}

declare global {
  interface Window {
    polyglot: WickedAPI;
  }
}
