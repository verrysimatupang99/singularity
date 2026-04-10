// Preload script MUST be CommonJS for Electron
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Test
  ping: () => ipcRenderer.invoke('ping'),

  // Sessions
  sessionsList: () => ipcRenderer.invoke('sessions:list'),
  sessionCreate: (data) => ipcRenderer.invoke('sessions:create', data),
  sessionDelete: (id) => ipcRenderer.invoke('sessions:delete', id),
  sessionLoad: (id) => ipcRenderer.invoke('sessions:load', id),
  sessionSave: (id, messages) => ipcRenderer.invoke('sessions:save', { id, messages }),

  // Chat
  chatSend: (provider, model, messages, apiKey) => ipcRenderer.invoke('chat:send', { provider, model, messages, apiKey }),
  chatCancel: (requestId) => ipcRenderer.invoke('chat:cancel', requestId),

  // Settings
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (settings) => ipcRenderer.invoke('settings:set', settings),

  // Auth
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authSetApiKey: (provider, key) => ipcRenderer.invoke('auth:setKey', { provider, key }),
  authDeleteApiKey: (provider) => ipcRenderer.invoke('auth:deleteKey', provider),

  // Providers
  providersList: () => ipcRenderer.invoke('providers:list'),

  // Streaming
  onChatChunk: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('chat:chunk', listener)
    return () => ipcRenderer.removeListener('chat:chunk', listener)
  },

  // File
  filePick: () => ipcRenderer.invoke('file:pick'),
  fileRead: (path) => ipcRenderer.invoke('file:read', path),

  // CLI
  cliDetect: () => ipcRenderer.invoke('cli:detect'),
  cliSpawn: (cliName, cwd, config) => ipcRenderer.invoke('cli:spawn', { cliName, cwd, config }),
  cliPrompt: (sessionId, text) => ipcRenderer.invoke('cli:prompt', { sessionId, text }),
  cliTerminate: (sessionId) => ipcRenderer.invoke('cli:terminate', sessionId),
  cliPermission: (sessionId, requestId, allowed) => ipcRenderer.invoke('cli:permission', { sessionId, requestId, allowed }),
  cliSessionsList: () => ipcRenderer.invoke('cli:sessions:list'),
  onCliStream: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('cli:stream', listener)
    return () => ipcRenderer.removeListener('cli:stream', listener)
  },
  onCliPermission: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('cli:permission', listener)
    return () => ipcRenderer.removeListener('cli:permission', listener)
  },
  onCliExit: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('cli:exit', listener)
    return () => ipcRenderer.removeListener('cli:exit', listener)
  },

  // MCP
  mcpList: () => ipcRenderer.invoke('mcp:list'),
  mcpStart: (name) => ipcRenderer.invoke('mcp:start', name),
  mcpStop: (name) => ipcRenderer.invoke('mcp:stop', name),
  mcpAdd: (name, config) => ipcRenderer.invoke('mcp:add', { name, config }),
  mcpRemove: (name) => ipcRenderer.invoke('mcp:remove', name),
  mcpTools: (name) => ipcRenderer.invoke('mcp:tools', name),
  mcpCallTool: (serverName, toolName, args) => ipcRenderer.invoke('mcp:callTool', { serverName, toolName, args }),

  // OAuth
  authGithubDevice: () => ipcRenderer.invoke('auth:github-device'),
  authGithubPoll: () => ipcRenderer.invoke('auth:github-poll'),
  authQwenDevice: () => ipcRenderer.invoke('auth:qwen-device'),
  authQwenPoll: () => ipcRenderer.invoke('auth:qwen-poll'),
  authGoogleOAuth: (start, port) => ipcRenderer.invoke('auth:google-oauth', start, port),
  authImportGemini: () => ipcRenderer.invoke('auth:import-gemini'),
  authValidateQwen: (apiKey) => ipcRenderer.invoke('auth:validate-qwen', apiKey),
  authOpenQwenConsole: () => ipcRenderer.invoke('auth:open-qwen-console'),
  authValidateGemini: (apiKey) => ipcRenderer.invoke('auth:validate-gemini', apiKey),
  authGoogleOAuthStart: (clientId) => ipcRenderer.invoke('auth:google-oauth-start', clientId),
  authGoogleOAuthStop: (clientId) => ipcRenderer.invoke('auth:google-oauth-stop', clientId),
  authOpenGoogleConsole: () => ipcRenderer.invoke('auth:open-google-cloud-console'),

  // Token optimizer
  optimizerCompress: (opts) => ipcRenderer.invoke('optimizer:compress', opts),
  optimizerEstimate: (messages) => ipcRenderer.invoke('optimizer:estimate', messages),

  // Memory
  memoryGet: () => ipcRenderer.invoke('memory:get'),
  memoryForget: (key) => ipcRenderer.invoke('memory:forget', key),
  memoryList: () => ipcRenderer.invoke('memory:list'),
  memoryDeleteById: (id) => ipcRenderer.invoke('memory:deleteById', id),
  memoryUpdate: (id, value) => ipcRenderer.invoke('memory:update', { id, value }),
  memoryClear: () => ipcRenderer.invoke('memory:clear'),
  memorySearch: (query) => ipcRenderer.invoke('memory:search', query),
  memoryRemember: (key, value, tags) => ipcRenderer.invoke('memory:remember', { key, value, tags }),

  // Tokens
  tokenRecord: (rec) => ipcRenderer.invoke('tokens:record', rec),
  tokenToday: () => ipcRenderer.invoke('tokens:today'),
  tokenMonth: () => ipcRenderer.invoke('tokens:month'),
  tokenBreakdown: () => ipcRenderer.invoke('tokens:breakdown'),
  tokenRecent: (limit) => ipcRenderer.invoke('tokens:recent', limit),

  // Agent
  agentExecuteTask: (opts) => ipcRenderer.invoke('agent:executeTask', opts),
  agentApprove: (opts) => ipcRenderer.invoke('agent:approve', opts),

  // Orchestrator
  orchestratorPlan: (opts) => ipcRenderer.invoke('orchestrator:plan', opts),
  orchestratorExecute: (opts) => ipcRenderer.invoke('orchestrator:execute', opts),
  orchestratorStatus: () => ipcRenderer.invoke('orchestrator:status'),
  orchestratorCancel: (orchestratorId) => ipcRenderer.invoke('orchestrator:cancel', orchestratorId),
  onOrchestratorEvent: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('orchestrator:event', listener)
    ipcRenderer.on('orchestrator:done', listener)
    ipcRenderer.on('orchestrator:error', listener)
    ipcRenderer.on('orchestrator:cancelled', listener)
    return () => {
      ipcRenderer.removeListener('orchestrator:event', listener)
      ipcRenderer.removeListener('orchestrator:done', listener)
      ipcRenderer.removeListener('orchestrator:error', listener)
      ipcRenderer.removeListener('orchestrator:cancelled', listener)
    }
  },

  // Plugins
  pluginsList: () => ipcRenderer.invoke('plugins:list'),
  pluginsInstall: (pluginDir) => ipcRenderer.invoke('plugins:install', pluginDir),
  pluginsUnload: (name) => ipcRenderer.invoke('plugins:unload', name),
  pluginsFetchRegistry: (url) => ipcRenderer.invoke('plugins:fetchRegistry', url),
  pluginsInstallFromRegistry: (entry) => ipcRenderer.invoke('plugins:installFromRegistry', entry),

  // Computer Use
  cuScreenshot: () => ipcRenderer.invoke('cu:screenshot'),
  cuAction: (action) => ipcRenderer.invoke('cu:action', action),

  // Crash
  crashReport: (report) => ipcRenderer.invoke('crash:report', report),
  crashList: () => ipcRenderer.invoke('crash:list'),

  // Updater
  updaterInstallNow: () => ipcRenderer.invoke('updater:install-now'),
  updaterCheckNow: () => ipcRenderer.invoke('updater:check-now'),
  onUpdaterUpdateAvailable: (cb) => {
    const l = () => cb(); ipcRenderer.on('updater:update-available', l); return () => ipcRenderer.removeListener('updater:update-available', l)
  },
  onUpdaterUpdateDownloaded: (cb) => {
    const l = () => cb(); ipcRenderer.on('updater:update-downloaded', l); return () => ipcRenderer.removeListener('updater:update-downloaded', l)
  },
  onUpdaterDownloadProgress: (cb) => {
    const l = (_e, d) => cb(d); ipcRenderer.on('updater:download-progress', l); return () => ipcRenderer.removeListener('updater:download-progress', l)
  },

  // Window
  openNewWindow: (opts) => ipcRenderer.invoke('window:open-new', opts),
  closeCurrentWindow: () => ipcRenderer.invoke('window:close-current'),
  setWindowTitle: (title) => ipcRenderer.invoke('window:set-title', title),
  listWindows: () => ipcRenderer.invoke('window:list'),

  // Onboarding
  storageMarkOnboardingComplete: () => ipcRenderer.invoke('storage:markOnboardingComplete'),
  storageIsFirstRun: () => ipcRenderer.invoke('storage:isFirstRun'),

  // Terminal
  terminalCreate: (opts) => ipcRenderer.invoke('terminal:create', opts),
  terminalWrite: (opts) => ipcRenderer.invoke('terminal:write', opts),
  terminalResize: (opts) => ipcRenderer.invoke('terminal:resize', opts),
  terminalKill: (termId) => ipcRenderer.invoke('terminal:kill', termId),
  onTerminalData: (cb) => {
    const listener = (_event, data) => cb(data)
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  onTerminalExit: (cb) => {
    const listener = (_event, data) => cb(data)
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  },
})

contextBridge.exposeInMainWorld('platform', process.platform)
