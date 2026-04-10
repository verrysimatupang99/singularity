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
  sessionExport: (sessionId: string, format: 'markdown' | 'json') =>
    ipcRenderer.invoke('session:export', { sessionId, format }),

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

  // Providers
  providersList: () => ipcRenderer.invoke('providers:list'),

  // Streaming
  onChatChunk: (
    callback: (data: {
      requestId: string
      content: string
      done: boolean
      usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
    }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      data: { requestId: string; content: string; done: boolean; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } },
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

  // Auth device flow (TASK 4d)
  authConnect: (providerId: string) =>
    ipcRenderer.invoke('auth:connect', { providerId }),
  authConnectPoll: (providerId: string, device_code: string, interval: number) =>
    ipcRenderer.invoke('auth:connect-poll', { providerId, device_code, interval }),
  authDisconnect: (providerId: string) =>
    ipcRenderer.invoke('auth:disconnect', { providerId }),

  // Security (TASK 4c)
  isSecureMode: () => ipcRenderer.invoke('security:isSecureMode'),

  // AI Diff Apply (TASK 5)
  aiApplyDiff: (filePath: string, diff: string) =>
    ipcRenderer.invoke('ai:applyDiff', { filePath, diff }),
  aiPreviewDiff: (filePath: string, diff: string) =>
    ipcRenderer.invoke('ai:previewDiff', { filePath, diff }),
  aiGenerateDiff: (filePath: string, newContent: string) =>
    ipcRenderer.invoke('ai:generateDiff', { filePath, newContent }),

  // File operations (TASK 2)
  filePick: () => ipcRenderer.invoke('file:pick'),
  fileRead: (path: string) => ipcRenderer.invoke('file:read', path),
  fsPickFolder: () => ipcRenderer.invoke('fs:pickFolder'),
  fsReadDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
  fsReadFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  fsWriteFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', { filePath, content }),
  fsSearch: (pattern: string, directory: string, options: { caseSensitive: boolean; useRegex: boolean; filePattern?: string }) =>
    ipcRenderer.invoke('fs:search', { pattern, directory, options }),

  // Gemini credential import (TASK 5b)
  authImportGeminiCreds: () => ipcRenderer.invoke('auth:import-gemini-creds'),

  // Terminal (TASK 4)
  terminalCreate: (opts: { cwd: string; shell?: string }) =>
    ipcRenderer.invoke('terminal:create', opts),
  terminalWrite: (opts: { termId: string; data: string }) =>
    ipcRenderer.invoke('terminal:write', opts),
  terminalResize: (opts: { termId: string; cols: number; rows: number }) =>
    ipcRenderer.invoke('terminal:resize', opts),
  terminalKill: (termId: string) =>
    ipcRenderer.invoke('terminal:kill', termId),
  onTerminalData: (cb: (data: { termId: string; data: string }) => void) => {
    const listener = (_event: unknown, d: { termId: string; data: string }) => cb(d)
    ipcRenderer.on('terminal:data', listener)
    return () => ipcRenderer.removeListener('terminal:data', listener)
  },
  onTerminalExit: (cb: (data: { termId: string; exitCode: number }) => void) => {
    const listener = (_event: unknown, d: { termId: string; exitCode: number }) => cb(d)
    ipcRenderer.on('terminal:exit', listener)
    return () => ipcRenderer.removeListener('terminal:exit', listener)
  },

  // Agent (Phase 6 - TASK 3)
  agentExecuteTask: (opts: { task: string; workspaceRoot: string; provider: string; model: string }) =>
    ipcRenderer.invoke('agent:executeTask', opts),
  agentApprove: (opts: { agentId: string; approved: boolean }) =>
    ipcRenderer.invoke('agent:approve', opts),
  onAgentEvent: (cb: (event: unknown) => void) => {
    const listener = (_event: unknown, data: unknown) => cb(data)
    ipcRenderer.on('agent:event', listener)
    return () => ipcRenderer.removeListener('agent:event', listener)
  },
})

contextBridge.exposeInMainWorld('platform', process.platform)
