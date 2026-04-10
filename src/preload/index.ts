import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  // Test
  ping: () => ipcRenderer.invoke('ping'),

  // Sessions
  sessionsList: () => ipcRenderer.invoke('sessions:list'),
  sessionCreate: (data: { name?: string; provider: string; model: string }) =>
    ipcRenderer.invoke('sessions:create', data),
  sessionDelete: (id: string) => ipcRenderer.invoke('sessions:delete', id),
  sessionLoad: (id: string) => ipcRenderer.invoke('sessions:load', id),
  sessionSave: (id: string, messages: unknown[]) =>
    ipcRenderer.invoke('sessions:save', { id, messages }),

  // Chat
  chatSend: (
    provider: string,
    model: string,
    messages: unknown[],
    apiKey?: string,
  ) => ipcRenderer.invoke('chat:send', { provider, model, messages, apiKey }),
  chatCancel: (requestId: string) =>
    ipcRenderer.invoke('chat:cancel', requestId),

  // Settings
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke('settings:set', settings),

  // Auth
  authStatus: () => ipcRenderer.invoke('auth:status'),
  authSetApiKey: (provider: string, key: string) =>
    ipcRenderer.invoke('auth:setKey', { provider, key }),
  authDeleteApiKey: (provider: string) =>
    ipcRenderer.invoke('auth:deleteKey', provider),

  // Streaming
  onChatChunk: (
    callback: (data: {
      requestId: string
      content: string
      done: boolean
    }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { requestId: string; content: string; done: boolean },
    ) => callback(data)
    ipcRenderer.on('chat:chunk', listener)
    return () => {
      ipcRenderer.removeListener('chat:chunk', listener)
    }
  },

  // -----------------------------------------------------------------------
  // CLI (M7)
  // -----------------------------------------------------------------------

  cliDetect: () => ipcRenderer.invoke('cli:detect'),
  cliSpawn: (cliName: string, cwd: string, config?: { env?: Record<string, string>; extraArgs?: string[] }) =>
    ipcRenderer.invoke('cli:spawn', { cliName, cwd, config }),
  cliPrompt: (sessionId: string, text: string) =>
    ipcRenderer.invoke('cli:prompt', { sessionId, text }),
  cliTerminate: (sessionId: string) =>
    ipcRenderer.invoke('cli:terminate', sessionId),
  cliPermission: (sessionId: string, requestId: string, allowed: boolean) =>
    ipcRenderer.invoke('cli:permission', { sessionId, requestId, allowed }),
  cliSessionsList: () => ipcRenderer.invoke('cli:sessions:list'),

  onCliStream: (
    callback: (data: { sessionId: string; chunk: unknown }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { sessionId: string; chunk: unknown },
    ) => callback(data)
    ipcRenderer.on('cli:stream', listener)
    return () => {
      ipcRenderer.removeListener('cli:stream', listener)
    }
  },

  onCliPermission: (
    callback: (data: { sessionId: string; request: unknown }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { sessionId: string; request: unknown },
    ) => callback(data)
    ipcRenderer.on('cli:permission', listener)
    return () => {
      ipcRenderer.removeListener('cli:permission', listener)
    }
  },

  onCliExit: (
    callback: (data: { sessionId: string }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { sessionId: string },
    ) => callback(data)
    ipcRenderer.on('cli:exit', listener)
    return () => {
      ipcRenderer.removeListener('cli:exit', listener)
    }
  },

  // -----------------------------------------------------------------------
  // MCP (M11)
  // -----------------------------------------------------------------------

  mcpList: () => ipcRenderer.invoke('mcp:list'),
  mcpStart: (name: string) => ipcRenderer.invoke('mcp:start', name),
  mcpStop: (name: string) => ipcRenderer.invoke('mcp:stop', name),
  mcpAdd: (name: string, config: { command: string; args: string[]; env?: Record<string, string>; cwd?: string; timeout?: number }) =>
    ipcRenderer.invoke('mcp:add', { name, config }),
  mcpRemove: (name: string) => ipcRenderer.invoke('mcp:remove', name),
  mcpTools: (name: string) => ipcRenderer.invoke('mcp:tools', name),
  mcpCallTool: (serverName: string, toolName: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke('mcp:callTool', { serverName, toolName, args }),

  // -----------------------------------------------------------------------
  // OAuth (M2+M3)
  // -----------------------------------------------------------------------

  authGithubDevice: () => ipcRenderer.invoke('auth:github-device'),
  authGithubPoll: () => ipcRenderer.invoke('auth:github-poll'),
  authQwenDevice: () => ipcRenderer.invoke('auth:qwen-device'),
  authQwenPoll: () => ipcRenderer.invoke('auth:qwen-poll'),
  authGoogleOAuth: (start: boolean, port?: number) =>
    ipcRenderer.invoke('auth:google-oauth', start, port),
  authImportGemini: () => ipcRenderer.invoke('auth:import-gemini'),
})

contextBridge.exposeInMainWorld('platform', process.platform)
