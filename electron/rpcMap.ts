import type { WickedAPI } from '../src/types';

// The single source of truth mapping every window.polyglot method to its IPC
// channel. Both the desktop preload (preload.ts) and the LAN web portal's
// browser bridge (webPortal.ts) are generated from this map, so the two
// surfaces can never drift apart. Every method is a plain passthrough:
// polyglot.method(...args) → invoke(channel, ...args).
export const RPC_CHANNELS: Record<keyof WickedAPI, string> = {
  // Chats
  getChats: 'chats:getAll',
  createChat: 'chats:create',
  updateChatTitle: 'chats:updateTitle',
  updateChatFolder: 'chats:updateFolder',
  updateChatModel: 'chats:updateModel',
  deleteChat: 'chats:delete',
  updateChatSystemPrompt: 'chats:updateSystemPrompt',
  updateChatAgentPersona: 'chats:updateAgentPersona',
  branchChat: 'chats:branch',
  setChatNoMemory: 'chats:setNoMemory',
  setChatCommitted: 'chats:setCommitted',
  getDeletedChats: 'chats:getDeleted',
  restoreChat: 'chats:restore',
  purgeChat: 'chats:purge',

  // Messages
  getMessages: 'messages:getAll',
  saveMessage: 'messages:save',
  deleteMessage: 'messages:delete',
  deleteMessagesFrom: 'messages:deleteFrom',
  searchMessages: 'search:messages',

  // Prompt templates
  getTemplates: 'templates:getAll',
  saveTemplate: 'templates:save',
  deleteTemplate: 'templates:delete',

  // Folders
  getFolders: 'folders:getAll',
  createFolder: 'folders:create',
  renameFolder: 'folders:rename',
  moveFolder: 'folders:move',
  deleteFolder: 'folders:delete',

  // Chat links
  getChatLinks: 'links:get',
  addChatLink: 'links:add',
  removeChatLink: 'links:remove',

  // Settings
  getSettings: 'settings:get',
  saveSettings: 'settings:save',

  // Dialogs
  openFileDialog: 'dialog:openFile',
  openVaultFolderDialog: 'dialog:openVaultFolder',

  // Vault
  vaultReadAll: 'vault:readAll',
  vaultWriteNote: 'vault:writeNote',
  vaultWriteNoteForChat: 'vault:writeNoteForChat',
  vaultReadNote: 'vault:readNote',
  vaultSearch: 'vault:search',
  vaultGetEmbeddings: 'vault:getEmbeddings',
  vaultSaveEmbedding: 'vault:saveEmbedding',
  vaultRegenerateIndex: 'vault:regenerateIndex',
  vaultGitStatus: 'vault:gitStatus',
  vaultGitSync: 'vault:gitSync',

  // Export
  exportMarkdown: 'export:markdown',
  exportPDF: 'export:pdf',

  // MCP servers
  mcpGetServers: 'mcp:getServers',
  mcpSaveServers: 'mcp:saveServers',
  mcpListTools: 'mcp:listTools',
  mcpCallTool: 'mcp:callTool',
  mcpTestServer: 'mcp:testServer',
  mcpDisconnect: 'mcp:disconnect',

  // Updates
  getAppVersion: 'app:getVersion',
  checkForUpdates: 'app:checkForUpdates',
  installUpdate: 'update:install',

  // Model discovery
  listOpenAICompatModels: 'models:listOpenAICompat',

  // Agent personas (vault-backed brains)
  agentGetPersonas: 'agent:getPersonas',
  agentCreatePersona: 'agent:createPersona',
  agentUpdatePersona: 'agent:updatePersona',
  agentDeletePersona: 'agent:deletePersona',
  brainFolderDigest: 'brain:folderDigest',
  brainFolderSearch: 'brain:folderSearch',

  // Role-Play (RP)
  rpGetPersonas: 'rp:getPersonas',
  rpCreatePersona: 'rp:createPersona',
  rpUpdatePersona: 'rp:updatePersona',
  rpDeletePersona: 'rp:deletePersona',
  rpGetPersonaImages: 'rp:getPersonaImages',
  rpAddPersonaImage: 'rp:addPersonaImage',
  rpDeletePersonaImage: 'rp:deletePersonaImage',
  rpRotateDueAvatars: 'rp:rotateDueAvatars',
  rpGetScenes: 'rp:getScenes',
  rpCreateScene: 'rp:createScene',
  rpRenameScene: 'rp:renameScene',
  rpDeleteScene: 'rp:deleteScene',
  rpGetSceneMembers: 'rp:getSceneMembers',
  rpSetSceneMembers: 'rp:setSceneMembers',
  rpGetSceneDisabled: 'rp:getSceneDisabled',
  rpSetMemberEnabled: 'rp:setMemberEnabled',
  rpSetSceneSummarized: 'rp:setSceneSummarized',
  rpGetSceneMessages: 'rp:getSceneMessages',
  rpSaveSceneMessage: 'rp:saveSceneMessage',
  rpUpdateSceneMessage: 'rp:updateSceneMessage',
  rpDeleteSceneMessage: 'rp:deleteSceneMessage',
  rpSetMessageRating: 'rp:setMessageRating',
  rpClearScene: 'rp:clearScene',
  rpReadMemory: 'rp:readMemory',
  rpAppendMemory: 'rp:appendMemory',
  rpClearMemory: 'rp:clearMemory',
  rpOpenMemoryFolder: 'rp:openMemoryFolder',
  rpSyncProfiles: 'rp:syncProfiles',
  rpSyncFromVault: 'rp:syncFromVault',
  rpGrokComplete: 'rp:grokComplete',

  // Project Board
  pbGetDataFolder: 'pb:getDataFolder',
  pbChooseDataFolder: 'pb:chooseDataFolder',
  pbSetDataFolder: 'pb:setDataFolder',
  pbGetProjects: 'pb:getProjects',
  pbCreateProject: 'pb:createProject',
  pbRenameProject: 'pb:renameProject',
  pbDeleteProject: 'pb:deleteProject',
  pbLoadBoard: 'pb:loadBoard',
  pbSaveBoard: 'pb:saveBoard',
  pbSaveAsset: 'pb:saveAsset',
  pbGetAsset: 'pb:getAsset',
  pbImportImage: 'pb:importImage',

  // Web portal
  portalGetStatus: 'portal:getStatus',

  // Shell
  openExternal: 'shell:openExternal',
};
