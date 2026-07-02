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
  updateChatSystemPrompt: (id, prompt) => ipcRenderer.invoke('chats:updateSystemPrompt', id, prompt),
  updateChatAgentPersona: (id, personaId) =>
    ipcRenderer.invoke('chats:updateAgentPersona', id, personaId),
  branchChat: (id, upto) => ipcRenderer.invoke('chats:branch', id, upto),
  setChatNoMemory: (id, v) => ipcRenderer.invoke('chats:setNoMemory', id, v),
  setChatCommitted: (id, ts) => ipcRenderer.invoke('chats:setCommitted', id, ts),
  getDeletedChats: () => ipcRenderer.invoke('chats:getDeleted'),
  restoreChat: (id) => ipcRenderer.invoke('chats:restore', id),
  purgeChat: (id) => ipcRenderer.invoke('chats:purge', id),

  // Message edit/branch + search
  deleteMessage: (id) => ipcRenderer.invoke('messages:delete', id),
  deleteMessagesFrom: (chatId, createdAt) =>
    ipcRenderer.invoke('messages:deleteFrom', chatId, createdAt),
  searchMessages: (query) => ipcRenderer.invoke('search:messages', query),

  // Prompt templates
  getTemplates: () => ipcRenderer.invoke('templates:getAll'),
  saveTemplate: (name, body) => ipcRenderer.invoke('templates:save', name, body),
  deleteTemplate: (id) => ipcRenderer.invoke('templates:delete', id),

  // Folders
  getFolders: () => ipcRenderer.invoke('folders:getAll'),
  createFolder: (name, parentId) => ipcRenderer.invoke('folders:create', name, parentId ?? null),
  renameFolder: (id, name) => ipcRenderer.invoke('folders:rename', id, name),
  moveFolder: (id, parentId) => ipcRenderer.invoke('folders:move', id, parentId),
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
  vaultWriteNoteForChat: (category, filename, content, sourceChatId) =>
    ipcRenderer.invoke('vault:writeNoteForChat', category, filename, content, sourceChatId),
  vaultReadNote: (p) => ipcRenderer.invoke('vault:readNote', p),
  vaultSearch: (query) => ipcRenderer.invoke('vault:search', query),
  vaultGetEmbeddings: () => ipcRenderer.invoke('vault:getEmbeddings'),
  vaultSaveEmbedding: (p, embedding) => ipcRenderer.invoke('vault:saveEmbedding', p, embedding),
  vaultRegenerateIndex: () => ipcRenderer.invoke('vault:regenerateIndex'),
  vaultGitStatus: () => ipcRenderer.invoke('vault:gitStatus'),
  vaultGitSync: (message) => ipcRenderer.invoke('vault:gitSync', message),

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
  installUpdate: () => ipcRenderer.invoke('update:install'),

  // Model discovery (OpenAI/DeepSeek listed via main to avoid CORS)
  listOpenAICompatModels: (baseUrl, apiKey) =>
    ipcRenderer.invoke('models:listOpenAICompat', baseUrl, apiKey),

  // Agent personas (vault-backed brains)
  agentGetPersonas: () => ipcRenderer.invoke('agent:getPersonas'),
  agentCreatePersona: (data) => ipcRenderer.invoke('agent:createPersona', data),
  agentUpdatePersona: (id, patch) => ipcRenderer.invoke('agent:updatePersona', id, patch),
  agentDeletePersona: (id) => ipcRenderer.invoke('agent:deletePersona', id),
  brainFolderDigest: (folderPath) => ipcRenderer.invoke('brain:folderDigest', folderPath),
  brainFolderSearch: (folderPath, query, limit) =>
    ipcRenderer.invoke('brain:folderSearch', folderPath, query, limit),

  // Role-Play (RP)
  rpGetPersonas: () => ipcRenderer.invoke('rp:getPersonas'),
  rpCreatePersona: (data) => ipcRenderer.invoke('rp:createPersona', data),
  rpUpdatePersona: (id, patch) => ipcRenderer.invoke('rp:updatePersona', id, patch),
  rpDeletePersona: (id) => ipcRenderer.invoke('rp:deletePersona', id),
  rpGetPersonaImages: (personaId) => ipcRenderer.invoke('rp:getPersonaImages', personaId),
  rpAddPersonaImage: (personaId, dataUrl) =>
    ipcRenderer.invoke('rp:addPersonaImage', personaId, dataUrl),
  rpDeletePersonaImage: (imageId) => ipcRenderer.invoke('rp:deletePersonaImage', imageId),
  rpRotateDueAvatars: () => ipcRenderer.invoke('rp:rotateDueAvatars'),
  rpGetScenes: () => ipcRenderer.invoke('rp:getScenes'),
  rpCreateScene: (name, personaIds) => ipcRenderer.invoke('rp:createScene', name, personaIds),
  rpRenameScene: (id, name) => ipcRenderer.invoke('rp:renameScene', id, name),
  rpDeleteScene: (id) => ipcRenderer.invoke('rp:deleteScene', id),
  rpGetSceneMembers: (sceneId) => ipcRenderer.invoke('rp:getSceneMembers', sceneId),
  rpSetSceneMembers: (sceneId, personaIds) =>
    ipcRenderer.invoke('rp:setSceneMembers', sceneId, personaIds),
  rpGetSceneDisabled: (sceneId) => ipcRenderer.invoke('rp:getSceneDisabled', sceneId),
  rpSetMemberEnabled: (sceneId, personaId, enabled) =>
    ipcRenderer.invoke('rp:setMemberEnabled', sceneId, personaId, enabled),
  rpSetSceneSummarized: (sceneId, count) =>
    ipcRenderer.invoke('rp:setSceneSummarized', sceneId, count),
  rpGetSceneMessages: (sceneId) => ipcRenderer.invoke('rp:getSceneMessages', sceneId),
  rpSaveSceneMessage: (msg) => ipcRenderer.invoke('rp:saveSceneMessage', msg),
  rpUpdateSceneMessage: (id, content) =>
    ipcRenderer.invoke('rp:updateSceneMessage', id, content),
  rpDeleteSceneMessage: (id) => ipcRenderer.invoke('rp:deleteSceneMessage', id),
  rpSetMessageRating: (id, rating) => ipcRenderer.invoke('rp:setMessageRating', id, rating),
  rpClearScene: (sceneId) => ipcRenderer.invoke('rp:clearScene', sceneId),
  rpReadMemory: (sceneId) => ipcRenderer.invoke('rp:readMemory', sceneId),
  rpAppendMemory: (sceneId, sceneName, summary) =>
    ipcRenderer.invoke('rp:appendMemory', sceneId, sceneName, summary),
  rpClearMemory: (sceneId) => ipcRenderer.invoke('rp:clearMemory', sceneId),
  rpOpenMemoryFolder: () => ipcRenderer.invoke('rp:openMemoryFolder'),
  rpSyncProfiles: () => ipcRenderer.invoke('rp:syncProfiles'),
  rpSyncFromVault: (sceneId) => ipcRenderer.invoke('rp:syncFromVault', sceneId),
  rpGrokComplete: (apiKey, model, messages, options) =>
    ipcRenderer.invoke('rp:grokComplete', apiKey, model, messages, options),

  // Shell
  openExternal: (p) => ipcRenderer.invoke('shell:openExternal', p),
};

contextBridge.exposeInMainWorld('polyglot', api);
