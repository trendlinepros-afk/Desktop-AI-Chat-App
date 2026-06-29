import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import electronUpdater from 'electron-updater';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const { autoUpdater } = electronUpdater;
import * as db from './db';
import * as vault from './vault';
import * as mcp from './mcp';
import type { McpServerConfig } from './mcp';
import type { Provider, Settings } from '../src/types';

// GitHub repo used for the "Check for updates" feature.
const UPDATE_REPO = 'trendlinepros-afk/desktop-ai-chat-app';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite injects these in dev; they are undefined in production builds.
process.env.APP_ROOT = path.join(__dirname, '..');
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');

let win: BrowserWindow | null = null;

function resolvePreload(): string {
  // vite-plugin-electron may emit preload.mjs or preload.js depending on format.
  for (const name of ['preload.mjs', 'preload.js']) {
    const candidate = path.join(MAIN_DIST, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(MAIN_DIST, 'preload.mjs');
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0b',
    title: 'WICKED',
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      // ESM preload scripts require the sandbox to be disabled.
      sandbox: false,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }
}

app.whenReady().then(() => {
  db.initDb();
  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
  }
});

app.on('before-quit', () => {
  void mcp.disconnectAll();
});

function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
  };
  return map[ext.toLowerCase()] || 'application/octet-stream';
}

// Pull readable text out of an attachment when possible (PDF / txt / md).
async function extractText(buffer: Buffer, ext: string): Promise<string | undefined> {
  try {
    if (ext === '.txt' || ext === '.md') return buffer.toString('utf-8').slice(0, 100_000);
    if (ext === '.pdf') {
      const mod = (await import('pdf-parse')) as unknown as {
        default: (b: Buffer) => Promise<{ text: string }>;
      };
      const parsed = await mod.default(buffer);
      return parsed.text.slice(0, 100_000);
    }
  } catch (err) {
    console.warn('[extractText]', (err as Error).message);
  }
  return undefined;
}

function registerIpc(): void {
  // ----- Chats -----
  ipcMain.handle('chats:getAll', () => db.getChats());
  ipcMain.handle('chats:create', (_e, data) => db.createChat(data));
  ipcMain.handle('chats:updateTitle', (_e, id: string, title: string) =>
    db.updateChatTitle(id, title)
  );
  ipcMain.handle('chats:updateFolder', (_e, id: string, folderId: string | null) =>
    db.updateChatFolder(id, folderId)
  );
  ipcMain.handle('chats:updateModel', (_e, id: string, provider: Provider, modelVersion: string) =>
    db.updateChatModel(id, provider, modelVersion)
  );
  ipcMain.handle('chats:delete', (_e, id: string) => db.deleteChat(id));
  ipcMain.handle('chats:updateSystemPrompt', (_e, id: string, prompt: string) =>
    db.updateChatSystemPrompt(id, prompt)
  );
  ipcMain.handle('chats:branch', (_e, id: string, upto: number) => db.branchChat(id, upto));
  ipcMain.handle('chats:setNoMemory', (_e, id: string, v: boolean) => db.updateChatNoMemory(id, v));
  ipcMain.handle('chats:setCommitted', (_e, id: string, ts: number) =>
    db.updateChatCommitted(id, ts)
  );
  ipcMain.handle('chats:getDeleted', () => db.getDeletedChats());
  ipcMain.handle('chats:restore', (_e, id: string) => db.restoreChat(id));
  ipcMain.handle('chats:purge', (_e, id: string) => db.purgeChat(id));

  // Message edit/branch + global search
  ipcMain.handle('messages:delete', (_e, id: string) => db.deleteMessage(id));
  ipcMain.handle('messages:deleteFrom', (_e, chatId: string, createdAt: number) =>
    db.deleteMessagesFrom(chatId, createdAt)
  );
  ipcMain.handle('search:messages', (_e, query: string) => db.searchMessages(query));

  // Prompt templates
  ipcMain.handle('templates:getAll', () => db.getTemplates());
  ipcMain.handle('templates:save', (_e, name: string, body: string) => db.saveTemplate(name, body));
  ipcMain.handle('templates:delete', (_e, id: string) => db.deleteTemplate(id));

  // ----- Folders -----
  ipcMain.handle('folders:getAll', () => db.getFolders());
  ipcMain.handle('folders:create', (_e, name: string, parentId: string | null) =>
    db.createFolder(name, parentId)
  );
  ipcMain.handle('folders:rename', (_e, id: string, name: string) => db.renameFolder(id, name));
  ipcMain.handle('folders:move', (_e, id: string, parentId: string | null) =>
    db.moveFolder(id, parentId)
  );
  ipcMain.handle('folders:delete', (_e, id: string) => db.deleteFolder(id));

  // ----- Messages -----
  ipcMain.handle('messages:getAll', (_e, chatId: string) => db.getMessages(chatId));
  ipcMain.handle('messages:save', (_e, msg) => db.saveMessage(msg));

  // ----- Chat links -----
  ipcMain.handle('links:get', (_e, chatId: string) => db.getChatLinks(chatId));
  ipcMain.handle('links:add', (_e, src: string, linked: string) => db.addChatLink(src, linked));
  ipcMain.handle('links:remove', (_e, src: string, linked: string) =>
    db.removeChatLink(src, linked)
  );

  // ----- Settings -----
  ipcMain.handle('settings:get', () => db.getSettings());
  ipcMain.handle('settings:save', (_e, partial: Partial<Settings>) => db.saveSettings(partial));

  // ----- File dialogs -----
  ipcMain.handle('dialog:openFile', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [
        { name: 'Supported', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'txt', 'md'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath);
    const buffer = fs.readFileSync(filePath);
    const mime = mimeFromExt(ext);
    const data = buffer.toString('base64');
    // Extract text from documents so the model can actually read them.
    const text = await extractText(buffer, ext.toLowerCase());
    return { name: path.basename(filePath), mime, data, text };
  });

  ipcMain.handle('dialog:openVaultFolder', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose your WICKED Brain vault location',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // ----- Vault -----
  ipcMain.handle('vault:readAll', () => safeVault(() => vault.readAll(), []));
  ipcMain.handle('vault:writeNote', (_e, category: string, filename: string, content: string) =>
    vault.writeNote(category, filename, content)
  );
  ipcMain.handle(
    'vault:writeNoteForChat',
    (_e, category: string, filename: string, content: string, sourceChatId: string) =>
      vault.writeNoteForChat(category, filename, content, sourceChatId)
  );
  ipcMain.handle('vault:readNote', (_e, p: string) => vault.readNote(p));
  ipcMain.handle('vault:search', (_e, query: string) => safeVault(() => vault.search(query), []));
  ipcMain.handle('vault:getEmbeddings', () => safeVault(() => vault.getEmbeddings(), {}));
  ipcMain.handle('vault:saveEmbedding', (_e, p: string, embedding: number[]) =>
    vault.saveEmbedding(p, embedding)
  );
  ipcMain.handle('vault:regenerateIndex', () => safeVault(() => vault.regenerateIndex(), undefined));
  ipcMain.handle('vault:gitStatus', () =>
    safeVault(() => vault.gitStatus(), { isRepo: false, hasRemote: false, branch: '', dirtyCount: 0 })
  );
  ipcMain.handle('vault:gitSync', (_e, message: string) =>
    safeVault(() => vault.gitSync(message), 'Vault not configured.')
  );

  // ----- Export -----
  ipcMain.handle('export:markdown', async (_e, filename: string, content: string) => {
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: `${filename}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return null;
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return result.filePath;
  });

  ipcMain.handle('export:pdf', async (_e, filename: string, html: string) => {
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: `${filename}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;
    // Render the HTML in an offscreen window and print to PDF — no extra deps.
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
    await pdfWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    const data = await pdfWin.webContents.printToPDF({ printBackground: true });
    fs.writeFileSync(result.filePath, data);
    pdfWin.destroy();
    return result.filePath;
  });

  // ----- MCP servers -----
  ipcMain.handle('mcp:getServers', () => mcp.getServers());
  ipcMain.handle('mcp:saveServers', (_e, servers: McpServerConfig[]) => mcp.saveServers(servers));
  ipcMain.handle('mcp:listTools', () => mcp.listAllTools());
  ipcMain.handle('mcp:callTool', (_e, name: string, args: Record<string, unknown>) =>
    mcp.callTool(name, args)
  );
  ipcMain.handle('mcp:testServer', (_e, server: McpServerConfig) => mcp.testServer(server));
  ipcMain.handle('mcp:disconnect', (_e, id: string) => mcp.disconnect(id));

  // ----- Updates -----
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('app:checkForUpdates', async () => {
    const current = app.getVersion();
    try {
      const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Polyglot' },
      });
      if (!res.ok) {
        return { current, latest: null, hasUpdate: false, url: '', error: `GitHub returned ${res.status}` };
      }
      const data = (await res.json()) as { tag_name?: string; html_url?: string };
      const latestRaw = data.tag_name ?? '';
      const latest = latestRaw.replace(/^v/, '');
      return {
        current,
        latest: latest || null,
        hasUpdate: latest ? isNewer(latest, current) : false,
        url: data.html_url ?? `https://github.com/${UPDATE_REPO}/releases`,
      };
    } catch (err) {
      return { current, latest: null, hasUpdate: false, url: '', error: (err as Error).message };
    }
  });

  // Download & install an update via electron-updater (packaged builds only).
  ipcMain.handle('update:install', async () => {
    if (!app.isPackaged) {
      return 'Auto-install only works in the installed app. Use the download link instead.';
    }
    autoUpdater.autoDownload = false;
    return await new Promise<string>((resolve) => {
      autoUpdater.removeAllListeners();
      autoUpdater.on('error', (e) => resolve(`Update error: ${e.message}`));
      autoUpdater.on('update-not-available', () => resolve('You are already on the latest version.'));
      autoUpdater.on('update-available', () => {
        autoUpdater.downloadUpdate().catch((e) => resolve(`Download failed: ${e.message}`));
      });
      autoUpdater.on('download-progress', (p) => {
        win?.webContents.send('update:progress', Math.round(p.percent));
      });
      autoUpdater.on('update-downloaded', () => {
        resolve('Update downloaded — restarting to install…');
        setTimeout(() => autoUpdater.quitAndInstall(), 1000);
      });
      autoUpdater.checkForUpdates().catch((e) => resolve(`Update check failed: ${e.message}`));
    });
  });

  // List models from an OpenAI-compatible API (OpenAI, DeepSeek). Done in the
  // main process because these endpoints don't send CORS headers, so a
  // renderer-side fetch would be blocked (unlike Gemini, which allows it).
  ipcMain.handle('models:listOpenAICompat', async (_e, baseUrl: string, apiKey: string) => {
    if (!apiKey) return [] as string[];
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`Model list failed (${res.status})`);
    const data = (await res.json()) as { data?: { id?: string }[] };
    return (data.data ?? []).map((m) => m.id).filter((id): id is string => !!id);
  });

  // ----- Shell -----
  ipcMain.handle('shell:openExternal', (_e, p: string) => {
    // Treat as a file path inside the vault when relative.
    let target = p;
    const settings = db.getSettings();
    if (settings.vaultPath && !path.isAbsolute(p)) {
      target = path.join(settings.vaultPath, 'WickedBrain', p);
    }
    if (fs.existsSync(target)) return shell.openPath(target);
    return shell.openExternal(p);
  });
}

// Semver-ish comparison: returns true when `latest` is strictly newer than `current`.
function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .split('.')
      .map((n) => parseInt(n.replace(/[^0-9].*$/, ''), 10) || 0);
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

// Vault ops throw when no vault is configured yet; degrade gracefully.
function safeVault<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (err) {
    console.warn('[vault]', (err as Error).message);
    return fallback;
  }
}
