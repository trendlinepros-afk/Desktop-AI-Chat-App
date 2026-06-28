import { contextBridge, ipcRenderer } from 'electron';
import type { WickedAPI } from '../src/types';

const api: WickedAPI = {
  // Chats
  getChats: () => ipcRenderer.invoke('chats:getAll'),
  createChat: (data) => ipcRenderer.invoke('chats:create', data),
  updateChatTitle: (id, title) => ipcRenderer.invoke('chats:updateTitle', id, title),
  updateChatFolder: (id, folderId) => ipcRenderer.invoke('chats:updateFolder', id, folderId),
  updateChatModel: (id, provider, modelVersion) =>
    ipcRenderer.invoke('chats:updateModel', id, provider, modelVersion),
  deleteChat: (id) => ipcRenderer.invoke('chats:delete', id),

  // Folders
  getFolders: () => ipcRenderer.invoke('folders:getAll'),
  createFolder: (name) => ipcRenderer.invoke('folders:create', name),
  renameFolder: (id, name) => ipcRenderer.invoke('folders:rename', id, name),
  deleteFolder: (id) => ipcRenderer.invoke('folders:delete', id),

  // Messages
  getMessages: (chatId) => ipcRenderer.invoke('messages:getAll', chatId),
  saveMessage: (msg) => ipcRenderer.invoke('messages:save', msg),

  // Chat links
  getChatLinks: (chatId) => ipcRenderer.invoke('links:get', chatId),
  addChatLink: (src, linked) => ipcRenderer.invoke('links:add', src, linked),
  removeChatLink: (src, linked) => ipcRenderer.invoke('links:remove', src, linked),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (partial) => ipcRenderer.invoke('settings:save', partial),

  // Dialogs
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  openVaultFolderDialog: () => ipcRenderer.invoke('dialog:openVaultFolder'),

  // Vault
  vaultReadAll: () => ipcRenderer.invoke('vault:readAll'),
  vaultWriteNote: (category, filename, content) =>
    ipcRenderer.invoke('vault:writeNote', category, filename, content),
  vaultReadNote: (p) => ipcRenderer.invoke('vault:readNote', p),
  vaultSearch: (query) => ipcRenderer.invoke('vault:search', query),
  vaultGetEmbeddings: () => ipcRenderer.invoke('vault:getEmbeddings'),
  vaultSaveEmbedding: (p, embedding) => ipcRenderer.invoke('vault:saveEmbedding', p, embedding),
  vaultRegenerateIndex: () => ipcRenderer.invoke('vault:regenerateIndex'),

  // Export
  exportMarkdown: (filename, content) => ipcRenderer.invoke('export:markdown', filename, content),
  exportPDF: (filename, html) => ipcRenderer.invoke('export:pdf', filename, html),

  // MCP servers
  mcpGetServers: () => ipcRenderer.invoke('mcp:getServers'),
  mcpSaveServers: (servers) => ipcRenderer.invoke('mcp:saveServers', servers),
  mcpListTools: () => ipcRenderer.invoke('mcp:listTools'),
  mcpCallTool: (name, args) => ipcRenderer.invoke('mcp:callTool', name, args),
  mcpTestServer: (server) => ipcRenderer.invoke('mcp:testServer', server),
  mcpDisconnect: (id) => ipcRenderer.invoke('mcp:disconnect', id),

  // Updates
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  checkForUpdates: () => ipcRenderer.invoke('app:checkForUpdates'),

  // Shell
  openExternal: (p) => ipcRenderer.invoke('shell:openExternal', p),
};

contextBridge.exposeInMainWorld('polyglot', api);
