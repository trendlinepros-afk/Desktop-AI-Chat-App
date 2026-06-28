import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Chat, Folder, Message, Provider, Settings } from '../src/types';

let db: Database.Database;

const DEFAULT_SETTINGS: Settings = {
  openaiApiKey: '',
  geminiApiKey: '',
  deepseekApiKey: '',
  vaultPath: '',
  defaultProvider: 'openai',
  defaultModelVersion: 'gpt-4o',
  semanticIndexingEnabled: true,
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

    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_chats_folder ON chats(folder_id);
    CREATE INDEX IF NOT EXISTS idx_links_source ON chat_links(source_chat_id);
  `);
}

// ---------- Folders ----------

interface FolderRow {
  id: string;
  name: string;
  created_at: number;
}

function mapFolder(r: FolderRow): Folder {
  return { id: r.id, name: r.name, createdAt: r.created_at };
}

export function getFolders(): Folder[] {
  const rows = db.prepare('SELECT * FROM folders ORDER BY created_at ASC').all() as FolderRow[];
  return rows.map(mapFolder);
}

export function createFolder(name: string): Folder {
  const folder: FolderRow = { id: randomUUID(), name, created_at: Date.now() };
  db.prepare('INSERT INTO folders (id, name, created_at) VALUES (?, ?, ?)').run(
    folder.id,
    folder.name,
    folder.created_at
  );
  return mapFolder(folder);
}

export function renameFolder(id: string, name: string): void {
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id);
}

export function deleteFolder(id: string): void {
  // ON DELETE SET NULL moves chats to uncategorized automatically.
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
  };
}

export function getChats(): Chat[] {
  const rows = db.prepare('SELECT * FROM chats ORDER BY updated_at DESC').all() as ChatRow[];
  return rows.map(mapChat);
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
  };
  db.prepare(
    `INSERT INTO chats (id, title, folder_id, provider, model_version, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.title,
    row.folder_id,
    row.provider,
    row.model_version,
    row.created_at,
    row.updated_at
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

export function touchChat(id: string): void {
  db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), id);
}

export function deleteChat(id: string): void {
  db.prepare('DELETE FROM chats WHERE id = ?').run(id);
}

// ---------- Messages ----------

interface MessageRow {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  created_at: number;
}

function mapMessage(r: MessageRow): Message {
  return {
    id: r.id,
    chatId: r.chat_id,
    role: r.role as Message['role'],
    content: JSON.parse(r.content),
    createdAt: r.created_at,
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
}): Message {
  const row: MessageRow = {
    id: msg.id ?? randomUUID(),
    chat_id: msg.chatId,
    role: msg.role,
    content: JSON.stringify(msg.content),
    created_at: Date.now(),
  };
  db.prepare(
    'INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(row.id, row.chat_id, row.role, row.content, row.created_at);
  touchChat(msg.chatId);
  return mapMessage(row);
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
    openaiApiKey: map.get('openaiApiKey') ?? DEFAULT_SETTINGS.openaiApiKey,
    geminiApiKey: map.get('geminiApiKey') ?? DEFAULT_SETTINGS.geminiApiKey,
    deepseekApiKey: map.get('deepseekApiKey') ?? DEFAULT_SETTINGS.deepseekApiKey,
    vaultPath: map.get('vaultPath') ?? DEFAULT_SETTINGS.vaultPath,
    defaultProvider: (map.get('defaultProvider') as Provider) ?? DEFAULT_SETTINGS.defaultProvider,
    defaultModelVersion: map.get('defaultModelVersion') ?? DEFAULT_SETTINGS.defaultModelVersion,
    semanticIndexingEnabled: map.has('semanticIndexingEnabled')
      ? map.get('semanticIndexingEnabled') === 'true'
      : DEFAULT_SETTINGS.semanticIndexingEnabled,
  };
}

export function saveSettings(partial: Partial<Settings>): void {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const tx = db.transaction((entries: [string, string][]) => {
    for (const [key, value] of entries) stmt.run(key, value);
  });
  const entries = Object.entries(partial).map(
    ([k, v]) => [k, String(v)] as [string, string]
  );
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
