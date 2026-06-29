export type Provider = 'openai' | 'gemini' | 'deepseek' | 'ollama';

export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null = top-level folder
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

// ---------- Role-Play (RP) ----------
// A separate, self-contained side of the app: build personas of people you can
// talk to, then drop several of them into one group conversation (a "scene").
// Personas, scenes, and their memory are kept entirely apart from the main app's
// chats and the Obsidian Brain vault.

export interface RPPersona {
  id: string;
  name: string;
  description: string; // personality / background — drives the system prompt
  avatar: string; // an emoji shown in the list
  greeting: string; // optional opening line the persona sends first
  model: string; // Grok model used for this persona
  isMe: boolean; // marks the persona that represents YOU (your background)
  createdAt: number;
  updatedAt: number;
}

// A group conversation containing one or more personas.
export interface RPScene {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  summarizedCount: number; // # of messages already folded into the memory file
}

export interface RPMessage {
  id: string;
  sceneId: string;
  senderPersonaId: string | null; // null = a line typed by you (the human)
  content: string;
  createdAt: number;
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
  // Role-Play (RP) side — a separate chatbot powered by the Grok (xAI) API.
  grokApiKey: string;
  grokModel: string; // default Grok model for new personas
  rpMemoryEnabled: boolean; // periodically summarize RP chats into memory files
  rpSummarizeEvery: number; // summarize after this many new messages
  rpVaultPath: string; // a SEPARATE Obsidian vault folder used only for RP memory
  rpAutoReplyLimit: number; // max AI replies in a row before pausing for you (caps API use)
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
  createFolder(name: string, parentId?: string | null): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<void>;
  moveFolder(id: string, parentId: string | null): Promise<void>;
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

  // Role-Play (RP) — personas, group scenes, and their chats, stored separately
  rpGetPersonas(): Promise<RPPersona[]>;
  rpCreatePersona(data: {
    name: string;
    description: string;
    avatar?: string;
    greeting?: string;
    model: string;
    isMe?: boolean;
  }): Promise<RPPersona>;
  rpUpdatePersona(
    id: string,
    patch: Partial<
      Pick<RPPersona, 'name' | 'description' | 'avatar' | 'greeting' | 'model' | 'isMe'>
    >
  ): Promise<void>;
  rpDeletePersona(id: string): Promise<void>;

  // Scenes (group conversations)
  rpGetScenes(): Promise<RPScene[]>;
  rpCreateScene(name: string, personaIds: string[]): Promise<RPScene>;
  rpRenameScene(id: string, name: string): Promise<void>;
  rpDeleteScene(id: string): Promise<void>;
  rpGetSceneMembers(sceneId: string): Promise<string[]>;
  rpSetSceneMembers(sceneId: string, personaIds: string[]): Promise<void>;
  rpGetSceneDisabled(sceneId: string): Promise<string[]>;
  rpSetMemberEnabled(sceneId: string, personaId: string, enabled: boolean): Promise<void>;
  rpSetSceneSummarized(sceneId: string, count: number): Promise<void>;
  rpGetSceneMessages(sceneId: string): Promise<RPMessage[]>;
  rpSaveSceneMessage(msg: {
    sceneId: string;
    senderPersonaId: string | null;
    content: string;
  }): Promise<RPMessage>;
  rpUpdateSceneMessage(id: string, content: string): Promise<void>;
  rpDeleteSceneMessage(id: string): Promise<void>;
  rpClearScene(sceneId: string): Promise<void>;

  // RP memory — markdown files in a folder kept separate from the Brain vault
  rpReadMemory(sceneId: string): Promise<string>;
  rpAppendMemory(sceneId: string, sceneName: string, summary: string): Promise<void>;
  rpClearMemory(sceneId: string): Promise<void>;
  rpOpenMemoryFolder(): Promise<void>;
  rpSyncProfiles(): Promise<void>;
  rpSyncFromVault(sceneId: string): Promise<{ updated: number; memoryChars: number }>;

  // Grok (xAI) completion — run in the main process to avoid renderer CORS.
  rpGrokComplete(
    apiKey: string,
    model: string,
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  ): Promise<string>;

  // Shell
  openExternal(path: string): Promise<void>;
}

declare global {
  interface Window {
    polyglot: WickedAPI;
  }
}
