import Database from 'better-sqlite3';
import { app, safeStorage } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AgentPersona,
  Chat,
  Folder,
  Message,
  Provider,
  RPMessage,
  RPPersona,
  RPPersonaImage,
  RPScene,
  Settings,
} from '../src/types';

// API keys are stored encrypted at rest via the OS keychain (safeStorage).
const SECRET_KEYS = new Set(['openaiApiKey', 'geminiApiKey', 'deepseekApiKey', 'grokApiKey']);
const ENC_PREFIX = 'enc:v1:';

function encryptSecret(value: string): string {
  if (!value) return value;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return ENC_PREFIX + safeStorage.encryptString(value).toString('base64');
    }
  } catch {
    /* fall through to plaintext */
  }
  return value;
}

function decryptSecret(value: string): string {
  if (!value || !value.startsWith(ENC_PREFIX)) return value;
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(ENC_PREFIX.length), 'base64'));
  } catch {
    return '';
  }
}

let db: Database.Database;

const DEFAULT_SETTINGS: Settings = {
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
};

export function initDb(): void {
  const dbPath = path.join(app.getPath('userData'), 'wicked.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New Chat',
      folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
      provider TEXT NOT NULL,
      model_version TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_links (
      id TEXT PRIMARY KEY,
      source_chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      linked_chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      UNIQUE(source_chat_id, linked_chat_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS prompt_templates (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_chats_folder ON chats(folder_id);
    CREATE INDEX IF NOT EXISTS idx_links_source ON chat_links(source_chat_id);

    -- Role-Play (RP): personas, group scenes and their messages live in their
    -- own tables so they never mix with the main app's chats/messages.
    CREATE TABLE IF NOT EXISTS rp_personas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '🎭',
      greeting TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL,
      is_me INTEGER NOT NULL DEFAULT 0,
      avatar_image TEXT NOT NULL DEFAULT '',
      avatar_rotate_daily INTEGER NOT NULL DEFAULT 0,
      avatar_rotated_at INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      summarized_count INTEGER NOT NULL DEFAULT 0
    );

    -- A gallery of profile pics per persona (uploaded or AI-generated).
    CREATE TABLE IF NOT EXISTS rp_persona_images (
      id TEXT PRIMARY KEY,
      persona_id TEXT NOT NULL REFERENCES rp_personas(id) ON DELETE CASCADE,
      data_url TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rp_persona_images ON rp_persona_images(persona_id);

    CREATE TABLE IF NOT EXISTS rp_scenes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      summarized_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS rp_scene_members (
      scene_id TEXT NOT NULL REFERENCES rp_scenes(id) ON DELETE CASCADE,
      persona_id TEXT NOT NULL REFERENCES rp_personas(id) ON DELETE CASCADE,
      PRIMARY KEY (scene_id, persona_id)
    );

    CREATE TABLE IF NOT EXISTS rp_scene_messages (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES rp_scenes(id) ON DELETE CASCADE,
      sender_persona_id TEXT,
      content TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'chat',
      rating TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL
    );

    -- Characters muted in a scene (present in the cast but not allowed to talk).
    CREATE TABLE IF NOT EXISTS rp_scene_disabled (
      scene_id TEXT NOT NULL REFERENCES rp_scenes(id) ON DELETE CASCADE,
      persona_id TEXT NOT NULL REFERENCES rp_personas(id) ON DELETE CASCADE,
      PRIMARY KEY (scene_id, persona_id)
    );

    CREATE INDEX IF NOT EXISTS idx_rp_scene_messages_scene ON rp_scene_messages(scene_id);
    CREATE INDEX IF NOT EXISTS idx_rp_scene_members_scene ON rp_scene_members(scene_id);
  `);

  // RP migration: add the "is me" flag to personas created before group scenes.
  if (!columnExists('rp_personas', 'is_me')) {
    db.exec('ALTER TABLE rp_personas ADD COLUMN is_me INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnExists('rp_personas', 'avatar_image')) {
    db.exec("ALTER TABLE rp_personas ADD COLUMN avatar_image TEXT NOT NULL DEFAULT ''");
  }
  if (!columnExists('rp_personas', 'avatar_rotate_daily')) {
    db.exec('ALTER TABLE rp_personas ADD COLUMN avatar_rotate_daily INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnExists('rp_personas', 'avatar_rotated_at')) {
    db.exec('ALTER TABLE rp_personas ADD COLUMN avatar_rotated_at INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnExists('rp_scene_messages', 'kind')) {
    db.exec("ALTER TABLE rp_scene_messages ADD COLUMN kind TEXT NOT NULL DEFAULT 'chat'");
  }
  if (!columnExists('rp_scene_messages', 'rating')) {
    db.exec("ALTER TABLE rp_scene_messages ADD COLUMN rating TEXT NOT NULL DEFAULT ''");
  }

  // Lightweight migrations.
  if (!columnExists('chats', 'system_prompt')) {
    db.exec("ALTER TABLE chats ADD COLUMN system_prompt TEXT NOT NULL DEFAULT ''");
  }
  if (!columnExists('chats', 'deleted_at')) {
    db.exec('ALTER TABLE chats ADD COLUMN deleted_at INTEGER');
  }
  if (!columnExists('chats', 'no_memory')) {
    db.exec('ALTER TABLE chats ADD COLUMN no_memory INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnExists('chats', 'last_committed_at')) {
    db.exec('ALTER TABLE chats ADD COLUMN last_committed_at INTEGER NOT NULL DEFAULT 0');
  }
  // Record which model produced each message so bubbles stay tagged correctly
  // even after switching models mid-chat.
  if (!columnExists('messages', 'provider')) {
    db.exec('ALTER TABLE messages ADD COLUMN provider TEXT');
  }
  if (!columnExists('messages', 'model_version')) {
    db.exec('ALTER TABLE messages ADD COLUMN model_version TEXT');
  }
  // Nested folders: a folder may live inside another folder.
  if (!columnExists('folders', 'parent_id')) {
    db.exec('ALTER TABLE folders ADD COLUMN parent_id TEXT');
  }
  // Agent personas: "brain" characters backed by an Obsidian folder.
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_personas (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '🧠',
      system_prompt TEXT NOT NULL DEFAULT '',
      vault_path TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  // A chat may be bound to an agent persona (answers as that brain).
  if (!columnExists('chats', 'agent_persona_id')) {
    db.exec('ALTER TABLE chats ADD COLUMN agent_persona_id TEXT');
  }

  purgeExpiredChats();
}

const RECYCLE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Permanently remove chats that have been in the recycle bin longer than 30 days.
export function purgeExpiredChats(): void {
  const cutoff = Date.now() - RECYCLE_RETENTION_MS;
  db.prepare('DELETE FROM chats WHERE deleted_at IS NOT NULL AND deleted_at < ?').run(cutoff);
}

function columnExists(table: string, column: string): boolean {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

// ---------- Folders ----------

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: number;
}

function mapFolder(r: FolderRow): Folder {
  return { id: r.id, name: r.name, parentId: r.parent_id ?? null, createdAt: r.created_at };
}

export function getFolders(): Folder[] {
  const rows = db.prepare('SELECT * FROM folders ORDER BY created_at ASC').all() as FolderRow[];
  return rows.map(mapFolder);
}

export function createFolder(name: string, parentId: string | null = null): Folder {
  const folder: FolderRow = { id: randomUUID(), name, parent_id: parentId, created_at: Date.now() };
  db.prepare('INSERT INTO folders (id, name, parent_id, created_at) VALUES (?, ?, ?, ?)').run(
    folder.id,
    folder.name,
    folder.parent_id,
    folder.created_at
  );
  return mapFolder(folder);
}

export function renameFolder(id: string, name: string): void {
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id);
}

// Re-parent a folder. Guards against making a folder its own descendant.
export function moveFolder(id: string, parentId: string | null): void {
  if (parentId) {
    if (parentId === id) return;
    // Walk up from the proposed parent — if we hit `id`, this move would
    // create a cycle, so reject it.
    let cursor: string | null = parentId;
    const byId = new Map(
      (db.prepare('SELECT id, parent_id FROM folders').all() as FolderRow[]).map((r) => [
        r.id,
        r.parent_id,
      ])
    );
    while (cursor) {
      if (cursor === id) return;
      cursor = byId.get(cursor) ?? null;
    }
  }
  db.prepare('UPDATE folders SET parent_id = ? WHERE id = ?').run(parentId, id);
}

export function deleteFolder(id: string): void {
  // Recursively delete sub-folders first; chats in any of them fall back to
  // Uncategorized via the chats.folder_id ON DELETE SET NULL constraint.
  const children = db
    .prepare('SELECT id FROM folders WHERE parent_id = ?')
    .all(id) as { id: string }[];
  for (const child of children) deleteFolder(child.id);
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
}

// ---------- Chats ----------

interface ChatRow {
  id: string;
  title: string;
  folder_id: string | null;
  provider: string;
  model_version: string;
  created_at: number;
  updated_at: number;
  system_prompt: string | null;
  no_memory: number | null;
  last_committed_at: number | null;
  agent_persona_id?: string | null;
}

function mapChat(r: ChatRow): Chat {
  return {
    id: r.id,
    title: r.title,
    folderId: r.folder_id,
    provider: r.provider as Provider,
    modelVersion: r.model_version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    systemPrompt: r.system_prompt ?? '',
    noMemory: !!r.no_memory,
    lastCommittedAt: r.last_committed_at ?? 0,
    agentPersonaId: r.agent_persona_id ?? null,
  };
}

export function getChats(): Chat[] {
  const rows = db
    .prepare('SELECT * FROM chats WHERE deleted_at IS NULL ORDER BY updated_at DESC')
    .all() as ChatRow[];
  return rows.map(mapChat);
}

export interface DeletedChat extends Chat {
  deletedAt: number;
}

export function getDeletedChats(): DeletedChat[] {
  const rows = db
    .prepare('SELECT * FROM chats WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
    .all() as (ChatRow & { deleted_at: number })[];
  return rows.map((r) => ({ ...mapChat(r), deletedAt: r.deleted_at }));
}

export function restoreChat(id: string): void {
  db.prepare('UPDATE chats SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function purgeChat(id: string): void {
  db.prepare('DELETE FROM chats WHERE id = ?').run(id);
}

export function createChat(data: {
  title?: string;
  folderId?: string | null;
  provider: Provider;
  modelVersion: string;
}): Chat {
  const now = Date.now();
  const row: ChatRow = {
    id: randomUUID(),
    title: data.title ?? 'New Chat',
    folder_id: data.folderId ?? null,
    provider: data.provider,
    model_version: data.modelVersion,
    created_at: now,
    updated_at: now,
    system_prompt: '',
    no_memory: 0,
    last_committed_at: 0,
  };
  db.prepare(
    `INSERT INTO chats (id, title, folder_id, provider, model_version, created_at, updated_at, system_prompt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.title,
    row.folder_id,
    row.provider,
    row.model_version,
    row.created_at,
    row.updated_at,
    row.system_prompt
  );
  return mapChat(row);
}

export function updateChatTitle(id: string, title: string): void {
  db.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?').run(title, Date.now(), id);
}

export function updateChatFolder(id: string, folderId: string | null): void {
  db.prepare('UPDATE chats SET folder_id = ?, updated_at = ? WHERE id = ?').run(
    folderId,
    Date.now(),
    id
  );
}

export function updateChatModel(id: string, provider: Provider, modelVersion: string): void {
  db.prepare('UPDATE chats SET provider = ?, model_version = ?, updated_at = ? WHERE id = ?').run(
    provider,
    modelVersion,
    Date.now(),
    id
  );
}

export function updateChatSystemPrompt(id: string, systemPrompt: string): void {
  db.prepare('UPDATE chats SET system_prompt = ?, updated_at = ? WHERE id = ?').run(
    systemPrompt,
    Date.now(),
    id
  );
}

// Bind (or clear, with null) the agent persona whose brain a chat answers from.
export function updateChatAgentPersona(id: string, personaId: string | null): void {
  db.prepare('UPDATE chats SET agent_persona_id = ?, updated_at = ? WHERE id = ?').run(
    personaId,
    Date.now(),
    id
  );
}

// Per-chat opt-out of memory (skipped by the scheduled auto-commit). Does NOT
// bump updated_at — toggling this shouldn't look like new chat activity.
export function updateChatNoMemory(id: string, noMemory: boolean): void {
  db.prepare('UPDATE chats SET no_memory = ? WHERE id = ?').run(noMemory ? 1 : 0, id);
}

// Mark when a chat was last committed to memory.
export function updateChatCommitted(id: string, ts: number): void {
  db.prepare('UPDATE chats SET last_committed_at = ? WHERE id = ?').run(ts, id);
}

export function touchChat(id: string): void {
  db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

// Soft-delete: move the chat to the recycle bin (auto-purged after 30 days).
export function deleteChat(id: string): void {
  db.prepare('UPDATE chats SET deleted_at = ? WHERE id = ?').run(Date.now(), id);
}

// Fork a chat: new chat with the same model/folder/system prompt, copying all
// messages with created_at <= uptoCreatedAt. Returns the new chat.
export function branchChat(chatId: string, uptoCreatedAt: number): Chat | null {
  const src = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as ChatRow | undefined;
  if (!src) return null;
  const now = Date.now();
  const newId = randomUUID();
  db.prepare(
    `INSERT INTO chats (id, title, folder_id, provider, model_version, created_at, updated_at, system_prompt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId,
    `${src.title} (branch)`,
    src.folder_id,
    src.provider,
    src.model_version,
    now,
    now,
    src.system_prompt ?? ''
  );
  const msgs = db
    .prepare('SELECT * FROM messages WHERE chat_id = ? AND created_at <= ? ORDER BY created_at ASC')
    .all(chatId, uptoCreatedAt) as MessageRow[];
  const insert = db.prepare(
    'INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  let t = now;
  const tx = db.transaction(() => {
    for (const m of msgs) insert.run(randomUUID(), newId, m.role, m.content, t++);
  });
  tx();
  const row = db.prepare('SELECT * FROM chats WHERE id = ?').get(newId) as ChatRow;
  return mapChat(row);
}

// ---------- Messages ----------

interface MessageRow {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  created_at: number;
  provider: string | null;
  model_version: string | null;
}

function mapMessage(r: MessageRow): Message {
  return {
    id: r.id,
    chatId: r.chat_id,
    role: r.role as Message['role'],
    content: JSON.parse(r.content),
    createdAt: r.created_at,
    provider: (r.provider as Provider) ?? undefined,
    modelVersion: r.model_version ?? undefined,
  };
}

export function getMessages(chatId: string): Message[] {
  const rows = db
    .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC')
    .all(chatId) as MessageRow[];
  return rows.map(mapMessage);
}

export function saveMessage(msg: {
  id?: string;
  chatId: string;
  role: Message['role'];
  content: Message['content'];
  provider?: Provider;
  modelVersion?: string;
}): Message {
  // Guarantee strictly-increasing timestamps within a chat so range deletes
  // (regenerate / edit-and-resend) can't accidentally catch a sibling saved in
  // the same millisecond.
  const maxRow = db
    .prepare('SELECT MAX(created_at) AS m FROM messages WHERE chat_id = ?')
    .get(msg.chatId) as { m: number | null };
  const createdAt = Math.max(Date.now(), (maxRow?.m ?? 0) + 1);
  const row: MessageRow = {
    id: msg.id ?? randomUUID(),
    chat_id: msg.chatId,
    role: msg.role,
    content: JSON.stringify(msg.content),
    created_at: createdAt,
    provider: msg.provider ?? null,
    model_version: msg.modelVersion ?? null,
  };
  db.prepare(
    'INSERT INTO messages (id, chat_id, role, content, created_at, provider, model_version) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(row.id, row.chat_id, row.role, row.content, row.created_at, row.provider, row.model_version);
  touchChat(msg.chatId);
  return mapMessage(row);
}

export function deleteMessage(id: string): void {
  db.prepare('DELETE FROM messages WHERE id = ?').run(id);
}

// Delete a message and everything after it in the chat (used by regenerate/edit).
export function deleteMessagesFrom(chatId: string, createdAt: number): void {
  db.prepare('DELETE FROM messages WHERE chat_id = ? AND created_at >= ?').run(chatId, createdAt);
}

export interface MessageSearchHit {
  chatId: string;
  chatTitle: string;
  messageId: string;
  role: string;
  snippet: string;
  createdAt: number;
}

// Global full-text-ish search across all message bodies.
export function searchMessages(query: string): MessageSearchHit[] {
  const q = query.trim();
  if (!q) return [];
  const rows = db
    .prepare(
      `SELECT m.id as messageId, m.chat_id as chatId, m.role as role, m.content as content,
              m.created_at as createdAt, c.title as chatTitle
       FROM messages m JOIN chats c ON c.id = m.chat_id
       WHERE m.content LIKE ? ESCAPE '\\'
       ORDER BY m.created_at DESC LIMIT 50`
    )
    .all(`%${q.replace(/[\\%_]/g, '\\$&')}%`) as {
    messageId: string;
    chatId: string;
    role: string;
    content: string;
    createdAt: number;
    chatTitle: string;
  }[];

  const hits: MessageSearchHit[] = [];
  for (const r of rows) {
    let text = '';
    try {
      const parts = JSON.parse(r.content) as { type: string; text?: string }[];
      text = parts
        .filter((p) => p.type === 'text' && p.text)
        .map((p) => p.text)
        .join(' ');
    } catch {
      text = r.content;
    }
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) continue;
    const start = Math.max(0, idx - 40);
    const snippet = (start > 0 ? '…' : '') + text.slice(start, idx + q.length + 60).trim();
    hits.push({
      chatId: r.chatId,
      chatTitle: r.chatTitle,
      messageId: r.messageId,
      role: r.role,
      snippet,
      createdAt: r.createdAt,
    });
  }
  return hits;
}

// ---------- Prompt templates ----------

interface TemplateRow {
  id: string;
  name: string;
  body: string;
  created_at: number;
}

export function getTemplates(): { id: string; name: string; body: string; createdAt: number }[] {
  const rows = db
    .prepare('SELECT * FROM prompt_templates ORDER BY created_at ASC')
    .all() as TemplateRow[];
  return rows.map((r) => ({ id: r.id, name: r.name, body: r.body, createdAt: r.created_at }));
}

export function saveTemplate(name: string, body: string): { id: string; name: string; body: string; createdAt: number } {
  const row: TemplateRow = { id: randomUUID(), name, body, created_at: Date.now() };
  db.prepare('INSERT INTO prompt_templates (id, name, body, created_at) VALUES (?, ?, ?, ?)').run(
    row.id,
    row.name,
    row.body,
    row.created_at
  );
  return { id: row.id, name: row.name, body: row.body, createdAt: row.created_at };
}

export function deleteTemplate(id: string): void {
  db.prepare('DELETE FROM prompt_templates WHERE id = ?').run(id);
}

// ---------- Chat links ----------

export function getChatLinks(chatId: string): string[] {
  const rows = db
    .prepare('SELECT linked_chat_id FROM chat_links WHERE source_chat_id = ?')
    .all(chatId) as { linked_chat_id: string }[];
  return rows.map((r) => r.linked_chat_id);
}

export function addChatLink(sourceChatId: string, linkedChatId: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO chat_links (id, source_chat_id, linked_chat_id, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(randomUUID(), sourceChatId, linkedChatId, Date.now());
}

export function removeChatLink(sourceChatId: string, linkedChatId: string): void {
  db.prepare('DELETE FROM chat_links WHERE source_chat_id = ? AND linked_chat_id = ?').run(
    sourceChatId,
    linkedChatId
  );
}

// ---------- Settings ----------

export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as {
    key: string;
    value: string;
  }[];
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    openaiApiKey: decryptSecret(map.get('openaiApiKey') ?? DEFAULT_SETTINGS.openaiApiKey),
    geminiApiKey: decryptSecret(map.get('geminiApiKey') ?? DEFAULT_SETTINGS.geminiApiKey),
    deepseekApiKey: decryptSecret(map.get('deepseekApiKey') ?? DEFAULT_SETTINGS.deepseekApiKey),
    vaultPath: map.get('vaultPath') ?? DEFAULT_SETTINGS.vaultPath,
    defaultProvider: (map.get('defaultProvider') as Provider) ?? DEFAULT_SETTINGS.defaultProvider,
    defaultModelVersion: map.get('defaultModelVersion') ?? DEFAULT_SETTINGS.defaultModelVersion,
    semanticIndexingEnabled: map.has('semanticIndexingEnabled')
      ? map.get('semanticIndexingEnabled') === 'true'
      : DEFAULT_SETTINGS.semanticIndexingEnabled,
    ollamaBaseUrl: map.get('ollamaBaseUrl') ?? DEFAULT_SETTINGS.ollamaBaseUrl,
    autoMemoryEnabled: map.has('autoMemoryEnabled')
      ? map.get('autoMemoryEnabled') === 'true'
      : DEFAULT_SETTINGS.autoMemoryEnabled,
    autoMemoryIntervalMinutes: map.has('autoMemoryIntervalMinutes')
      ? Number(map.get('autoMemoryIntervalMinutes'))
      : DEFAULT_SETTINGS.autoMemoryIntervalMinutes,
    grokApiKey: decryptSecret(map.get('grokApiKey') ?? DEFAULT_SETTINGS.grokApiKey),
    grokModel: map.get('grokModel') ?? DEFAULT_SETTINGS.grokModel,
    rpMemoryEnabled: map.has('rpMemoryEnabled')
      ? map.get('rpMemoryEnabled') === 'true'
      : DEFAULT_SETTINGS.rpMemoryEnabled,
    rpSummarizeEvery: map.has('rpSummarizeEvery')
      ? Number(map.get('rpSummarizeEvery'))
      : DEFAULT_SETTINGS.rpSummarizeEvery,
    rpVaultPath: map.get('rpVaultPath') ?? DEFAULT_SETTINGS.rpVaultPath,
    rpAutoReplyLimit: map.has('rpAutoReplyLimit')
      ? Number(map.get('rpAutoReplyLimit'))
      : DEFAULT_SETTINGS.rpAutoReplyLimit,
  };
}

export function saveSettings(partial: Partial<Settings>): void {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) stmt.run(key, value);
  });
  const entries = Object.entries(partial).map(([k, v]) => {
    const str = String(v);
    return [k, SECRET_KEYS.has(k) ? encryptSecret(str) : str] as [string, string];
  });
  tx(entries);
}

export function getVaultPath(): string {
  return getSettings().vaultPath;
}

// The separate Obsidian vault used only for Role-Play memory.
export function getRpVaultPath(): string {
  return getSettings().rpVaultPath;
}

// ---------- Agent personas (vault-backed "brains") ----------

interface AgentPersonaRow {
  id: string;
  name: string;
  avatar: string;
  system_prompt: string;
  vault_path: string;
  created_at: number;
  updated_at: number;
}

function mapAgentPersona(r: AgentPersonaRow): AgentPersona {
  return {
    id: r.id,
    name: r.name,
    avatar: r.avatar,
    systemPrompt: r.system_prompt,
    vaultPath: r.vault_path,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function agentGetPersonas(): AgentPersona[] {
  const rows = db
    .prepare('SELECT * FROM agent_personas ORDER BY updated_at DESC')
    .all() as AgentPersonaRow[];
  return rows.map(mapAgentPersona);
}

export function agentGetPersona(id: string): AgentPersona | null {
  const r = db.prepare('SELECT * FROM agent_personas WHERE id = ?').get(id) as
    | AgentPersonaRow
    | undefined;
  return r ? mapAgentPersona(r) : null;
}

export function agentCreatePersona(data: {
  name: string;
  avatar?: string;
  systemPrompt: string;
  vaultPath: string;
}): AgentPersona {
  const now = Date.now();
  const row: AgentPersonaRow = {
    id: randomUUID(),
    name: data.name,
    avatar: data.avatar || '🧠',
    system_prompt: data.systemPrompt,
    vault_path: data.vaultPath,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO agent_personas (id, name, avatar, system_prompt, vault_path, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.name,
    row.avatar,
    row.system_prompt,
    row.vault_path,
    row.created_at,
    row.updated_at
  );
  return mapAgentPersona(row);
}

export function agentUpdatePersona(
  id: string,
  patch: Partial<Pick<AgentPersona, 'name' | 'avatar' | 'systemPrompt' | 'vaultPath'>>
): void {
  const cols: string[] = [];
  const vals: string[] = [];
  const map: Record<string, string> = {
    name: 'name',
    avatar: 'avatar',
    systemPrompt: 'system_prompt',
    vaultPath: 'vault_path',
  };
  for (const [key, col] of Object.entries(map)) {
    const v = (patch as Record<string, unknown>)[key];
    if (typeof v === 'string') {
      cols.push(`${col} = ?`);
      vals.push(v);
    }
  }
  if (cols.length === 0) return;
  cols.push('updated_at = ?');
  vals.push(String(Date.now()));
  db.prepare(`UPDATE agent_personas SET ${cols.join(', ')} WHERE id = ?`).run(...vals, id);
}

export function agentDeletePersona(id: string): void {
  db.prepare('DELETE FROM agent_personas WHERE id = ?').run(id);
  db.prepare('UPDATE chats SET agent_persona_id = NULL WHERE agent_persona_id = ?').run(id);
}

// Raw key/value access for settings that aren't part of the typed Settings shape
// (e.g. MCP server config stored as a JSON blob).
export function getSettingRaw(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSettingRaw(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value);
}

// ---------- Role-Play personas ----------

interface RPPersonaRow {
  id: string;
  name: string;
  description: string;
  avatar: string;
  greeting: string;
  model: string;
  is_me: number;
  avatar_image: string | null;
  avatar_rotate_daily: number | null;
  avatar_rotated_at: number | null;
  created_at: number;
  updated_at: number;
}

function mapPersona(r: RPPersonaRow): RPPersona {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    avatar: r.avatar,
    avatarImage: r.avatar_image ?? '',
    avatarRotateDaily: !!r.avatar_rotate_daily,
    greeting: r.greeting,
    model: r.model,
    isMe: !!r.is_me,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function rpGetPersonas(): RPPersona[] {
  const rows = db
    .prepare('SELECT * FROM rp_personas ORDER BY updated_at DESC')
    .all() as RPPersonaRow[];
  return rows.map(mapPersona);
}

// Only one persona can be "me" at a time — flipping one on clears the rest.
function clearOtherMe(exceptId: string): void {
  db.prepare('UPDATE rp_personas SET is_me = 0 WHERE id != ?').run(exceptId);
}

export function rpCreatePersona(data: {
  name: string;
  description: string;
  avatar?: string;
  avatarImage?: string;
  greeting?: string;
  model: string;
  isMe?: boolean;
}): RPPersona {
  const now = Date.now();
  const row: RPPersonaRow = {
    id: randomUUID(),
    name: data.name,
    description: data.description,
    avatar: data.avatar || '🎭',
    greeting: data.greeting ?? '',
    model: data.model,
    is_me: data.isMe ? 1 : 0,
    avatar_image: data.avatarImage ?? '',
    avatar_rotate_daily: 0,
    avatar_rotated_at: 0,
    created_at: now,
    updated_at: now,
  };
  db.prepare(
    `INSERT INTO rp_personas (id, name, description, avatar, greeting, model, is_me, avatar_image, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.name,
    row.description,
    row.avatar,
    row.greeting,
    row.model,
    row.is_me,
    row.avatar_image,
    row.created_at,
    row.updated_at
  );
  if (row.is_me) clearOtherMe(row.id);
  return mapPersona(row);
}

export function rpUpdatePersona(
  id: string,
  patch: Partial<
    Pick<
      RPPersona,
      | 'name'
      | 'description'
      | 'avatar'
      | 'avatarImage'
      | 'greeting'
      | 'model'
      | 'isMe'
      | 'avatarRotateDaily'
    >
  >
): void {
  const cols: string[] = [];
  const vals: (string | number)[] = [];
  const strMap: Record<string, string> = {
    name: 'name',
    description: 'description',
    avatar: 'avatar',
    avatarImage: 'avatar_image',
    greeting: 'greeting',
    model: 'model',
  };
  for (const [key, col] of Object.entries(strMap)) {
    const v = (patch as Record<string, unknown>)[key];
    if (typeof v === 'string') {
      cols.push(`${col} = ?`);
      vals.push(v);
    }
  }
  if (typeof patch.isMe === 'boolean') {
    cols.push('is_me = ?');
    vals.push(patch.isMe ? 1 : 0);
  }
  if (typeof patch.avatarRotateDaily === 'boolean') {
    cols.push('avatar_rotate_daily = ?');
    vals.push(patch.avatarRotateDaily ? 1 : 0);
  }
  if (cols.length === 0) return;
  cols.push('updated_at = ?');
  vals.push(Date.now());
  vals.push(id);
  db.prepare(`UPDATE rp_personas SET ${cols.join(', ')} WHERE id = ?`).run(...vals);
  if (patch.isMe === true) clearOtherMe(id);
}

export function rpDeletePersona(id: string): void {
  db.prepare('DELETE FROM rp_personas WHERE id = ?').run(id);
}

// ---------- Persona profile-pic gallery ----------

interface RPImageRow {
  id: string;
  persona_id: string;
  data_url: string;
  created_at: number;
}

function mapImage(r: RPImageRow): RPPersonaImage {
  return { id: r.id, personaId: r.persona_id, dataUrl: r.data_url, createdAt: r.created_at };
}

export function rpGetPersonaImages(personaId: string): RPPersonaImage[] {
  const rows = db
    .prepare('SELECT * FROM rp_persona_images WHERE persona_id = ? ORDER BY created_at DESC')
    .all(personaId) as RPImageRow[];
  return rows.map(mapImage);
}

export function rpAddPersonaImage(personaId: string, dataUrl: string): RPPersonaImage {
  const row: RPImageRow = {
    id: randomUUID(),
    persona_id: personaId,
    data_url: dataUrl,
    created_at: Date.now(),
  };
  db.prepare(
    'INSERT INTO rp_persona_images (id, persona_id, data_url, created_at) VALUES (?, ?, ?, ?)'
  ).run(row.id, row.persona_id, row.data_url, row.created_at);
  return mapImage(row);
}

export function rpDeletePersonaImage(imageId: string): void {
  db.prepare('DELETE FROM rp_persona_images WHERE id = ?').run(imageId);
}

// For each persona set to auto-rotate, if its avatar hasn't changed in ~a day and
// it has a gallery, switch to a different random pic. Returns how many changed.
export function rpRotateDueAvatars(): number {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const due = db
    .prepare('SELECT * FROM rp_personas WHERE avatar_rotate_daily = 1')
    .all() as RPPersonaRow[];
  let changed = 0;
  for (const p of due) {
    if (now - (p.avatar_rotated_at ?? 0) < DAY) continue;
    const imgs = db
      .prepare('SELECT data_url FROM rp_persona_images WHERE persona_id = ?')
      .all(p.id) as { data_url: string }[];
    if (imgs.length === 0) continue;
    const others = imgs.filter((i) => i.data_url !== p.avatar_image);
    const pool = others.length > 0 ? others : imgs;
    // Deterministic-ish pick without Math.random: rotate by day count.
    const pick = pool[Math.floor(now / DAY) % pool.length].data_url;
    db.prepare('UPDATE rp_personas SET avatar_image = ?, avatar_rotated_at = ? WHERE id = ?').run(
      pick,
      now,
      p.id
    );
    changed++;
  }
  return changed;
}

// ---------- Role-Play scenes (group conversations) ----------

interface RPSceneRow {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  summarized_count: number;
}

function mapScene(r: RPSceneRow): RPScene {
  return {
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    summarizedCount: r.summarized_count,
  };
}

export function rpGetScenes(): RPScene[] {
  const rows = db.prepare('SELECT * FROM rp_scenes ORDER BY updated_at DESC').all() as RPSceneRow[];
  return rows.map(mapScene);
}

export function rpCreateScene(name: string, personaIds: string[]): RPScene {
  const now = Date.now();
  const row: RPSceneRow = {
    id: randomUUID(),
    name: name || 'New conversation',
    created_at: now,
    updated_at: now,
    summarized_count: 0,
  };
  db.prepare(
    'INSERT INTO rp_scenes (id, name, created_at, updated_at, summarized_count) VALUES (?, ?, ?, ?, ?)'
  ).run(row.id, row.name, row.created_at, row.updated_at, row.summarized_count);
  rpSetSceneMembers(row.id, personaIds);
  return mapScene(row);
}

export function rpRenameScene(id: string, name: string): void {
  db.prepare('UPDATE rp_scenes SET name = ?, updated_at = ? WHERE id = ?').run(name, Date.now(), id);
}

export function rpDeleteScene(id: string): void {
  db.prepare('DELETE FROM rp_scenes WHERE id = ?').run(id);
}

export function rpSetSceneSummarized(sceneId: string, count: number): void {
  db.prepare('UPDATE rp_scenes SET summarized_count = ? WHERE id = ?').run(count, sceneId);
}

function touchScene(id: string): void {
  db.prepare('UPDATE rp_scenes SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function rpGetSceneMembers(sceneId: string): string[] {
  const rows = db
    .prepare('SELECT persona_id FROM rp_scene_members WHERE scene_id = ?')
    .all(sceneId) as { persona_id: string }[];
  return rows.map((r) => r.persona_id);
}

export function rpSetSceneMembers(sceneId: string, personaIds: string[]): void {
  const del = db.prepare('DELETE FROM rp_scene_members WHERE scene_id = ?');
  const ins = db.prepare(
    'INSERT OR IGNORE INTO rp_scene_members (scene_id, persona_id) VALUES (?, ?)'
  );
  const tx = db.transaction(() => {
    del.run(sceneId);
    for (const pid of personaIds) ins.run(sceneId, pid);
  });
  tx();
  // Drop any "disabled" rows for personas no longer in the cast.
  if (personaIds.length > 0) {
    const placeholders = personaIds.map(() => '?').join(',');
    db.prepare(
      `DELETE FROM rp_scene_disabled WHERE scene_id = ? AND persona_id NOT IN (${placeholders})`
    ).run(sceneId, ...personaIds);
  } else {
    db.prepare('DELETE FROM rp_scene_disabled WHERE scene_id = ?').run(sceneId);
  }
  touchScene(sceneId);
}

// Personas muted in a scene (cannot speak / won't auto-reply).
export function rpGetSceneDisabled(sceneId: string): string[] {
  const rows = db
    .prepare('SELECT persona_id FROM rp_scene_disabled WHERE scene_id = ?')
    .all(sceneId) as { persona_id: string }[];
  return rows.map((r) => r.persona_id);
}

export function rpSetMemberEnabled(sceneId: string, personaId: string, enabled: boolean): void {
  if (enabled) {
    db.prepare('DELETE FROM rp_scene_disabled WHERE scene_id = ? AND persona_id = ?').run(
      sceneId,
      personaId
    );
  } else {
    db.prepare(
      'INSERT OR IGNORE INTO rp_scene_disabled (scene_id, persona_id) VALUES (?, ?)'
    ).run(sceneId, personaId);
  }
}

// ---------- Role-Play scene messages ----------

interface RPMessageRow {
  id: string;
  scene_id: string;
  sender_persona_id: string | null;
  content: string;
  kind: string | null;
  rating: string | null;
  created_at: number;
}

function mapRPMessage(r: RPMessageRow): RPMessage {
  return {
    id: r.id,
    sceneId: r.scene_id,
    senderPersonaId: r.sender_persona_id,
    content: r.content,
    kind: (r.kind as RPMessage['kind']) ?? 'chat',
    rating: (r.rating as RPMessage['rating']) ?? '',
    createdAt: r.created_at,
  };
}

export function rpGetSceneMessages(sceneId: string): RPMessage[] {
  const rows = db
    .prepare('SELECT * FROM rp_scene_messages WHERE scene_id = ? ORDER BY created_at ASC')
    .all(sceneId) as RPMessageRow[];
  return rows.map(mapRPMessage);
}

export function rpSaveSceneMessage(msg: {
  sceneId: string;
  senderPersonaId: string | null;
  content: string;
  kind?: string;
}): RPMessage {
  const maxRow = db
    .prepare('SELECT MAX(created_at) AS m FROM rp_scene_messages WHERE scene_id = ?')
    .get(msg.sceneId) as { m: number | null };
  const createdAt = Math.max(Date.now(), (maxRow?.m ?? 0) + 1);
  const row: RPMessageRow = {
    id: randomUUID(),
    scene_id: msg.sceneId,
    sender_persona_id: msg.senderPersonaId,
    content: msg.content,
    kind: msg.kind ?? 'chat',
    rating: '',
    created_at: createdAt,
  };
  db.prepare(
    'INSERT INTO rp_scene_messages (id, scene_id, sender_persona_id, content, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(row.id, row.scene_id, row.sender_persona_id, row.content, row.kind, row.created_at);
  touchScene(msg.sceneId);
  return mapRPMessage(row);
}

export function rpSetMessageRating(id: string, rating: string): void {
  db.prepare('UPDATE rp_scene_messages SET rating = ? WHERE id = ?').run(rating, id);
}

export function rpClearScene(sceneId: string): void {
  db.prepare('DELETE FROM rp_scene_messages WHERE scene_id = ?').run(sceneId);
  db.prepare('UPDATE rp_scenes SET summarized_count = 0 WHERE id = ?').run(sceneId);
}

// Edit a message in place (used to tweak an AI reply so the story stays on track).
export function rpUpdateSceneMessage(id: string, content: string): void {
  db.prepare('UPDATE rp_scene_messages SET content = ? WHERE id = ?').run(content, id);
}

export function rpDeleteSceneMessage(id: string): void {
  db.prepare('DELETE FROM rp_scene_messages WHERE id = ?').run(id);
}
