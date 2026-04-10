export interface Session {
  id: string
  name: string
  provider: string
  model: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  model?: string
  provider?: string
  attachments?: Attachment[]
}

export interface Attachment {
  id: string
  name: string
  type: 'image' | 'text'
  mimeType: string
  content: string
  size: number
}

export interface ProviderInfo {
  id: string
  name: string
  icon: string
  status: 'connected' | 'disconnected' | 'configuring'
  models: ModelInfo[]
}

export interface ModelInfo {
  id: string
  name: string
  contextWindow?: number
  maxOutputTokens?: number
  supportsTools?: boolean
  supportsVision?: boolean
  supportsReasoning?: boolean
}

export interface AppSettings {
  theme: 'dark' | 'light'
  defaultProvider: string
  defaultModel: string
  apiKeys: Record<string, string>
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
  result?: string
  status: 'pending' | 'executing' | 'completed' | 'failed'
  timestamp: number
}

// ---------------------------------------------------------------------------
// OAuth (M2+M3) types
// ---------------------------------------------------------------------------

export interface GithubDeviceAuthResponse {
  status: 'pending'
  userCode: string
  verificationUri: string
  interval: number
}

export interface GithubDeviceAuthComplete {
  status: 'complete'
  accessToken: string
}

export interface GithubDeviceAuthError {
  status: 'error'
  error: string
}

export type GithubDeviceAuthResult =
  | GithubDeviceAuthResponse
  | GithubDeviceAuthComplete
  | GithubDeviceAuthError

export interface GoogleOAuthPending {
  status: 'pending'
  authUrl: string
}

export interface GoogleOAuthComplete {
  status: 'complete'
  tokens: { accessToken: string; refreshToken: string }
}

export interface GoogleOAuthError {
  status: 'error'
  error: string
}

export type GoogleOAuthResult = GoogleOAuthPending | GoogleOAuthComplete | GoogleOAuthError

export interface GeminiImportResult {
  success: boolean
  tokens?: { accessToken: string; refreshToken: string }
  error?: string
}

// ---------------------------------------------------------------------------
// CLI (M7) types
// ---------------------------------------------------------------------------

export interface StreamChunk {
  type: 'agent_message_chunk' | 'agent_thought_chunk' | 'tool_call' | 'end_turn'
  content?: { type: string; text: string }
  toolCall?: {
    id: string
    kind: string
    command?: string
    args?: Record<string, unknown>
  }
  stopReason?: 'end_turn' | 'error' | 'cancel'
  errorMessage?: string
}

export interface PermissionRequest {
  requestId: string
  toolCall: {
    id: string
    kind: string
    command?: string
    args?: Record<string, unknown>
  }
  options: {
    mode: 'allow_once' | 'allow_always' | 'deny'
    label?: string
  }[]
}

export interface CliSessionInfo {
  sessionId: string
  cliName: string
  cwd: string
  status: 'initializing' | 'ready' | 'streaming' | 'error' | 'terminated'
  error?: string
}

// ---------------------------------------------------------------------------
// MCP (M11) types
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  command: string
  args: string[]
  env?: Record<string, string>
  cwd?: string
  timeout?: number
}

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpServerInfo {
  name: string
  config: McpServerConfig
  status: 'stopped' | 'starting' | 'running' | 'error'
  tools: McpTool[]
  error?: string
}

// ---------------------------------------------------------------------------
// Provider registry
// ---------------------------------------------------------------------------

export const PROVIDERS: { id: string; name: string; keyFormat: 'api-key' | 'oauth' | 'credential'; models: string[] }[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    keyFormat: 'api-key',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyFormat: 'api-key',
    models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'],
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    keyFormat: 'api-key',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'],
  },
  {
    id: 'qwen',
    name: 'Qwen',
    keyFormat: 'api-key',
    models: [
      'qwen-max-latest', 'qwen-plus-latest', 'qwen-turbo-latest',
      'qwen3-235b-a22b', 'qwen3-72b', 'qwen3-32b', 'qwen3-14b', 'qwen3-8b',
      'qvq-max', 'qwen-vl-max', 'qwen-coder-plus',
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyFormat: 'api-key',
    models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.0-flash'],
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    keyFormat: 'oauth',
    models: ['gpt-4o-copilot', 'claude-sonnet-copilot'],
  },
]

// ---------------------------------------------------------------------------
// Global window API
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    api: {
      // Core
      ping: () => Promise<string>
      sessionsList: () => Promise<Session[]>
      sessionCreate: (data: { name?: string; provider: string; model: string }) => Promise<Session>
      sessionDelete: (id: string) => Promise<void>
      sessionLoad: (id: string) => Promise<{ session: Session; messages: ChatMessage[] }>
      sessionSave: (id: string, messages: ChatMessage[]) => Promise<void>
      sessionExport: (sessionId: string, format: 'markdown' | 'json') => Promise<{ success: boolean; filePath?: string; cancelled?: boolean }>
      chatSend: (provider: string, model: string, messages: ChatMessage[], apiKey?: string) => Promise<string>
      settingsGet: () => Promise<AppSettings>
      settingsSet: (settings: Partial<AppSettings>) => Promise<void>
      authStatus: () => Promise<Record<string, { status: string; models: string[] }>>
      authSetApiKey: (provider: string, key: string) => Promise<boolean>
      authDeleteApiKey: (provider: string) => Promise<void>
      providersList: () => Promise<Array<{ id: string; name: string; models: ModelInfo[] }>>
      onChatChunk: (callback: (data: { requestId: string; content: string; done: boolean; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }) => void) => () => void
      chatCancel: (requestId: string) => Promise<void>

      // CLI (M7)
      cliDetect: () => Promise<Record<string, string>>
      cliSpawn: (cliName: string, cwd: string, config?: { env?: Record<string, string>; extraArgs?: string[] }) => Promise<{ sessionId: string }>
      cliPrompt: (sessionId: string, text: string) => Promise<{ ok: boolean }>
      cliTerminate: (sessionId: string) => Promise<{ ok: boolean }>
      cliPermission: (sessionId: string, requestId: string, allowed: boolean) => Promise<{ ok: boolean }>
      cliSessionsList: () => Promise<CliSessionInfo[]>
      onCliStream: (callback: (data: { sessionId: string; chunk: StreamChunk }) => void) => () => void
      onCliPermission: (callback: (data: { sessionId: string; request: PermissionRequest }) => void) => () => void
      onCliExit: (callback: (data: { sessionId: string }) => void) => () => void

      // MCP (M11)
      mcpList: () => Promise<McpServerInfo[]>
      mcpStart: (name: string) => Promise<McpServerInfo | undefined>
      mcpStop: (name: string) => Promise<McpServerInfo | undefined>
      mcpAdd: (name: string, config: McpServerConfig) => Promise<McpServerInfo | undefined>
      mcpRemove: (name: string) => Promise<{ ok: boolean }>
      mcpTools: (name: string) => Promise<McpTool[]>
      mcpCallTool: (serverName: string, toolName: string, args: Record<string, unknown>) => Promise<unknown>

      // OAuth (M2+M3)
      authGithubDevice: () => Promise<GithubDeviceAuthResult>
      authGithubPoll: () => Promise<GithubDeviceAuthResult>
      authQwenDevice: () => Promise<GithubDeviceAuthResult>
      authQwenPoll: () => Promise<GithubDeviceAuthResult>
      authGoogleOAuth: (start: boolean, port?: number) => Promise<GoogleOAuthResult>
      authImportGemini: () => Promise<GeminiImportResult>

      // Auth device flow (TASK 4d)
      authConnect: (providerId: string) => Promise<{ user_code: string; verification_uri: string; error?: string }>
      authConnectPoll: (providerId: string, device_code: string, interval: number) => Promise<{ access_token?: string; error?: string; pending?: boolean }>
      authDisconnect: (providerId: string) => Promise<void>

      // Security (TASK 4c)
      isSecureMode: () => Promise<boolean>

      // AI Diff Apply (TASK 5)
      aiApplyDiff: (filePath: string, diff: string) => Promise<{ success: boolean; linesChanged?: { added: number; removed: number }; error?: string }>
      aiPreviewDiff: (filePath: string, diff: string) => Promise<{ filePath?: string; hunks?: unknown[]; originalLines?: number; totalAdded?: number; totalRemoved?: number; original?: string; error?: string }>
      aiGenerateDiff: (filePath: string, newContent: string) => Promise<{ success: boolean; diff?: string; error?: string }>

      // File operations (TASK 2)
      filePick: () => Promise<string[]>
      fileRead: (path: string) => Promise<{ type: 'image' | 'text'; content: string; mimeType: string; name: string; size: number }>
      fsPickFolder: () => Promise<string | null>
      fsReadDir: (dirPath: string) => Promise<Array<{ name: string; path: string; type: 'dir' | 'file'; size: number; ext: string }>>
      fsReadFile: (filePath: string) => Promise<string>
      fsWriteFile: (filePath: string, content: string) => Promise<{ success: boolean }>
      fsSearch: (pattern: string, directory: string, options: { caseSensitive: boolean; useRegex: boolean; filePattern?: string }) => Promise<Array<{ file: string; line: number; content: string }>>

      // Gemini credential import (TASK 5b)
      authImportGeminiCreds: () => Promise<{ success: boolean; error?: string }>

      // Terminal (TASK 4)
      terminalCreate: (opts: { cwd: string; shell?: string }) => Promise<{ termId: string }>
      terminalWrite: (opts: { termId: string; data: string }) => Promise<{ ok: boolean; error?: string }>
      terminalResize: (opts: { termId: string; cols: number; rows: number }) => Promise<{ ok: boolean }>
      terminalKill: (termId: string) => Promise<{ ok: boolean }>
      onTerminalData: (cb: (data: { termId: string; data: string }) => void) => () => void
      onTerminalExit: (cb: (data: { termId: string; exitCode: number }) => void) => () => void

      // Agent (Phase 6 - TASK 3)
      agentExecuteTask: (opts: { task: string; workspaceRoot: string; provider: string; model: string }) => Promise<{ agentId: string }>
      agentApprove: (opts: { agentId: string; approved: boolean }) => Promise<{ ok: boolean }>
      onAgentEvent: (cb: (event: unknown) => void) => () => void
    }
    platform: string
  }
}
