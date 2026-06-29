import Database from 'better-sqlite3';
import { app, safeStorage } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Chat, Folder, Message, Provider, Settings } from '../src/types';

// API keys are stored encrypted at rest via the OS keychain (safeStorage).
const SECRET_KEYS = new Set(['openaiApiKey', 'geminiApiKey', 'deepseekApiKey']);
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
  `);

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
