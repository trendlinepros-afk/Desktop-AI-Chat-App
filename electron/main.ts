import { app, BrowserWindow, ipcMain, dialog, session, shell } from 'electron';
import electronUpdater from 'electron-updater';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const { autoUpdater } = electronUpdater;
import * as db from './db';
import * as vault from './vault';
import * as rpMemory from './rpMemory';
import * as brainFolder from './brainFolder';
import * as projectBoard from './projectBoard';
import * as dataRoot from './dataRoot';
import * as comfy from './comfy';
import * as comfyLauncher from './comfyLauncher';
import * as webPortal from './webPortal';
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

// The window/taskbar icon (bundled via electron-builder `files`). On Windows the
// OS also uses the exe icon; this covers dev and the Linux/runtime window icon.
function resolveIcon(): string | undefined {
  const candidate = path.join(process.env.APP_ROOT ?? '', 'build', 'icon.png');
  return fs.existsSync(candidate) ? candidate : undefined;
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0a0b',
    title: 'WICKED',
    icon: resolveIcon(),
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
  // Explicitly allow permission requests from our own renderer (microphone
  // for voice chat/dictation) — documents Electron's default-allow behavior.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) =>
    callback(true)
  );
  // Must run before registerIpc so the portal sees every handler.
  webPortal.captureIpcHandlers();
  registerIpc();
  createWindow();
  webPortal.init(RENDERER_DIST);
  webPortal.sync();
  dataRoot.startBackupSchedule();
  void comfyLauncher.autoLaunch();

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
  comfyLauncher.stop();
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
  ipcMain.handle('chats:updateAgentPersona', (_e, id: string, personaId: string | null) =>
    db.updateChatAgentPersona(id, personaId)
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
  ipcMain.handle('folders:create', (_e, name: string, parentId?: string | null) =>
    db.createFolder(name, parentId ?? null)
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

  // ----- Agent personas (vault-backed brains) -----
  ipcMain.handle('agent:getPersonas', () => db.agentGetPersonas());
  ipcMain.handle('agent:createPersona', (_e, data) => db.agentCreatePersona(data));
  ipcMain.handle('agent:updatePersona', (_e, id: string, patch) => db.agentUpdatePersona(id, patch));
  ipcMain.handle('agent:deletePersona', (_e, id: string) => db.agentDeletePersona(id));
  ipcMain.handle('brain:folderDigest', (_e, folderPath: string) => brainFolder.digest(folderPath));
  ipcMain.handle('brain:folderSearch', (_e, folderPath: string, query: string, limit?: number) =>
    brainFolder.search(folderPath, query, limit)
  );

  // ----- Project Board -----
  ipcMain.handle('pb:getDataFolder', () => projectBoard.getDataFolder());
  ipcMain.handle('pb:chooseDataFolder', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose where Project Board data is stored',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });
  ipcMain.handle('pb:setDataFolder', (_e, folder: string, migrate: boolean) => {
    if (migrate) projectBoard.migrateData(folder);
    db.saveSettings({ projectBoardPath: folder });
  });
  ipcMain.handle('pb:getProjects', () => projectBoard.listProjects());
  ipcMain.handle('pb:createProject', (_e, name: string, icon?: string) =>
    projectBoard.createProject(name, icon)
  );
  ipcMain.handle('pb:renameProject', (_e, id: string, name: string) =>
    projectBoard.renameProject(id, name)
  );
  ipcMain.handle('pb:deleteProject', (_e, id: string) => projectBoard.deleteProject(id));
  ipcMain.handle('pb:loadBoard', (_e, projectId: string) => projectBoard.loadBoard(projectId));
  ipcMain.handle('pb:saveBoard', (_e, projectId: string, data) =>
    projectBoard.saveBoard(projectId, data)
  );
  ipcMain.handle('pb:saveAsset', (_e, projectId: string, dataUrl: string) =>
    projectBoard.saveAsset(projectId, dataUrl)
  );
  ipcMain.handle('pb:getAsset', (_e, projectId: string, assetId: string) =>
    projectBoard.getAsset(projectId, assetId)
  );
  ipcMain.handle('pb:importImage', async (_e, projectId: string) => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return projectBoard.saveAssetFromFile(projectId, result.filePaths[0]);
  });

  // ----- Settings -----
  ipcMain.handle('settings:get', () => db.getSettings());
  ipcMain.handle('settings:save', (_e, partial: Partial<Settings>) => {
    db.saveSettings(partial);
    // Apply web-portal changes (enable/disable/port) immediately.
    if ('webPortalEnabled' in partial || 'webPortalPort' in partial) webPortal.sync();
  });

  // ----- Web portal -----
  ipcMain.handle('portal:getStatus', () => webPortal.getStatus());

  // ----- Data root & backups -----
  ipcMain.handle('data:getLocations', () => dataRoot.getLocations());
  ipcMain.handle('data:consolidate', (_e, root: string) => dataRoot.consolidate(root));

  // ----- Local image generation (ComfyUI) -----
  ipcMain.handle('comfy:getStatus', () => comfy.getStatus());
  ipcMain.handle('comfy:listModels', () => comfy.listModels());
  ipcMain.handle('comfy:freeVram', () => comfy.freeVram());
  ipcMain.handle('comfy:loadModel', () => comfy.loadModel());
  ipcMain.handle('comfy:generate', (_e, opts: comfy.GenerateOpts) => comfy.generate(opts));
  ipcMain.handle('comfy:launch', () => comfyLauncher.launch());
  ipcMain.handle('comfy:chooseFolder', async () => {
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory'],
      title: 'Choose your ComfyUI folder (the one containing run_nvidia_gpu.bat)',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

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

  // ----- Role-Play (RP) -----
  // Persona writes also mirror a markdown profile into the RP vault so the
  // roster is visible in Obsidian. safeVault swallows errors when no vault yet.
  ipcMain.handle('rp:getPersonas', () => db.rpGetPersonas());
  ipcMain.handle('rp:createPersona', (_e, data) => {
    const persona = db.rpCreatePersona(data);
    safeVault(() => rpMemory.writePersonaProfile(persona), undefined);
    return persona;
  });
  ipcMain.handle('rp:updatePersona', (_e, id: string, patch) => {
    db.rpUpdatePersona(id, patch);
    const persona = db.rpGetPersonas().find((p) => p.id === id);
    if (persona) safeVault(() => rpMemory.writePersonaProfile(persona), undefined);
  });
  ipcMain.handle('rp:deletePersona', (_e, id: string) => {
    db.rpDeletePersona(id);
    safeVault(() => rpMemory.deletePersonaProfile(id), undefined);
  });
  ipcMain.handle('rp:getPersonaImages', (_e, personaId: string) =>
    db.rpGetPersonaImages(personaId)
  );
  ipcMain.handle('rp:addPersonaImage', (_e, personaId: string, dataUrl: string) =>
    db.rpAddPersonaImage(personaId, dataUrl)
  );
  ipcMain.handle('rp:deletePersonaImage', (_e, imageId: string) => db.rpDeletePersonaImage(imageId));
  ipcMain.handle('rp:rotateDueAvatars', () => db.rpRotateDueAvatars());
  ipcMain.handle('rp:syncProfiles', () =>
    safeVault(() => rpMemory.syncPersonaProfiles(db.rpGetPersonas()), undefined)
  );
  // Pull persona edits made in the Obsidian vault back into the app so the
  // currently-open story uses the latest character info. Scene memory is already
  // read live each turn; this returns its size so the UI can confirm.
  ipcMain.handle('rp:syncFromVault', (_e, sceneId: string) =>
    safeVault(
      () => {
        const known = new Map(db.rpGetPersonas().map((p) => [p.id, p]));
        let updated = 0;
        for (const prof of rpMemory.readPersonaProfiles()) {
          if (!known.has(prof.id)) continue;
          db.rpUpdatePersona(prof.id, {
            name: prof.name || known.get(prof.id)!.name,
            avatar: prof.avatar,
            description: prof.description,
            greeting: prof.greeting,
          });
          updated++;
        }
        return { updated, memoryChars: rpMemory.readMemory(sceneId).length };
      },
      { updated: 0, memoryChars: 0 }
    )
  );

  // Scenes
  ipcMain.handle('rp:getScenes', () => db.rpGetScenes());
  ipcMain.handle('rp:createScene', (_e, name: string, personaIds: string[]) =>
    db.rpCreateScene(name, personaIds)
  );
  ipcMain.handle('rp:renameScene', (_e, id: string, name: string) => db.rpRenameScene(id, name));
  ipcMain.handle('rp:deleteScene', (_e, id: string) => {
    db.rpDeleteScene(id);
    safeVault(() => rpMemory.clearMemory(id), undefined);
  });
  ipcMain.handle('rp:getSceneMembers', (_e, sceneId: string) => db.rpGetSceneMembers(sceneId));
  ipcMain.handle('rp:setSceneMembers', (_e, sceneId: string, personaIds: string[]) =>
    db.rpSetSceneMembers(sceneId, personaIds)
  );
  ipcMain.handle('rp:getSceneDisabled', (_e, sceneId: string) => db.rpGetSceneDisabled(sceneId));
  ipcMain.handle('rp:setMemberEnabled', (_e, sceneId: string, personaId: string, enabled: boolean) =>
    db.rpSetMemberEnabled(sceneId, personaId, enabled)
  );
  ipcMain.handle('rp:setSceneSummarized', (_e, sceneId: string, count: number) =>
    db.rpSetSceneSummarized(sceneId, count)
  );
  ipcMain.handle('rp:getSceneMessages', (_e, sceneId: string) => db.rpGetSceneMessages(sceneId));
  ipcMain.handle('rp:saveSceneMessage', (_e, msg) => db.rpSaveSceneMessage(msg));
  ipcMain.handle('rp:updateSceneMessage', (_e, id: string, content: string) =>
    db.rpUpdateSceneMessage(id, content)
  );
  ipcMain.handle('rp:deleteSceneMessage', (_e, id: string) => db.rpDeleteSceneMessage(id));
  ipcMain.handle('rp:setMessageRating', (_e, id: string, rating: string) =>
    db.rpSetMessageRating(id, rating)
  );
  ipcMain.handle('rp:clearScene', (_e, sceneId: string) => {
    db.rpClearScene(sceneId);
    safeVault(() => rpMemory.clearMemory(sceneId), undefined);
  });

  // Memory
  ipcMain.handle('rp:readMemory', (_e, sceneId: string) =>
    safeVault(() => rpMemory.readMemory(sceneId), '')
  );
  ipcMain.handle('rp:appendMemory', (_e, sceneId: string, sceneName: string, summary: string) =>
    safeVault(() => rpMemory.appendMemory(sceneId, sceneName, summary), undefined)
  );
  ipcMain.handle('rp:clearMemory', (_e, sceneId: string) =>
    safeVault(() => rpMemory.clearMemory(sceneId), undefined)
  );
  ipcMain.handle('rp:openMemoryFolder', () => rpMemory.openMemoryFolder());

  // Grok (xAI) chat completion. Done in the main process (Node) so it isn't
  // subject to renderer CORS — a direct browser fetch to api.x.ai fails and the
  // SDK surfaces it as a bare "Connection error".
  ipcMain.handle(
    'rp:grokComplete',
    async (
      _e,
      apiKey: string,
      model: string,
      messages: { role: string; content: string }[],
      options?: { temperature?: number; presencePenalty?: number; frequencyPenalty?: number }
    ) => {
      if (!apiKey) throw new Error('No Grok API key set. Add one in RP Settings.');

      const temp = options?.temperature !== undefined ? { temperature: options.temperature } : {};
      const penalties: Record<string, number> = {};
      if (options?.presencePenalty !== undefined) penalties.presence_penalty = options.presencePenalty;
      if (options?.frequencyPenalty !== undefined)
        penalties.frequency_penalty = options.frequencyPenalty;

      // Try richest first, then progressively drop sampling params some models
      // (e.g. grok-3) reject with a 400. De-duplicated so we never retry identically.
      const candidates: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      for (const extra of [{ ...temp, ...penalties }, { ...temp }, {}]) {
        const body = { model, messages, ...extra };
        const key = JSON.stringify(Object.keys(extra).sort());
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push(body);
        }
      }

      const detailOf = async (r: Response): Promise<string> => {
        try {
          const j = (await r.json()) as { error?: { message?: string } | string };
          return typeof j.error === 'string' ? j.error : j.error?.message || '';
        } catch {
          return (await r.text().catch(() => '')) || '';
        }
      };

      let res: Response | null = null;
      let detail = '';
      for (let i = 0; i < candidates.length; i++) {
        try {
          res = await fetch('https://api.x.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'content-type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(candidates[i]),
          });
        } catch (err) {
          throw new Error(`Couldn't reach the Grok API: ${(err as Error).message}`);
        }
        if (res.ok) break;
        detail = await detailOf(res);
        // Only a 400 about an unsupported sampling param is worth retrying plainer.
        if (res.status !== 400 || i === candidates.length - 1) break;
      }

      if (!res || !res.ok) {
        throw new Error(`Grok API error (${res?.status ?? '?'}): ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      return data.choices?.[0]?.message?.content ?? '';
    }
  );

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
