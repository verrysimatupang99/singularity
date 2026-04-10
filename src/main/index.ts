import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync } from 'fs'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import {
  listSessions,
  createSession,
  deleteSession,
  loadSession,
  saveSession,
  getSettings,
  setSettings,
  getAuthStatus,
  setApiKey,
  deleteApiKey,
  getApiKey,
  isSecureMode,
} from './services/storage.js'
import { CliSessionManager, CliError } from './services/cliSessionManager.js'
import { McpManager } from './services/mcpManager.js'
import { initProviders, registry } from './providers/index.js'
import {
  githubDeviceAuth,
  githubPoll,
  qwenDeviceAuth,
  qwenPoll,
  googleOAuth,
  importGeminiCliCredentials,
  initiateGitHubDeviceFlow,
  pollGitHubDeviceToken,
} from './services/oauthService.js'

// Fix GPU issues on Linux
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-sandbox')

app.disableHardwareAcceleration()

let mainWindow: BrowserWindow | null = null

// Track active streaming requests for cancellation
const activeRequests = new Map<string, AbortController>()

function getAppPath(): string {
  return app.isPackaged
    ? process.resourcesPath
    : process.cwd()
}

function createWindow(): void {
  const preloadPath = app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'dist', 'preload', 'index.js')
    : join(process.cwd(), 'dist', 'preload', 'index.js')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Singularity',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    const indexPath = app.isPackaged
      ? join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'index.html')
      : join(process.cwd(), 'dist', 'renderer', 'index.html')
    mainWindow.loadFile(indexPath)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// --- IPC Handlers ---

ipcMain.handle('ping', () => 'pong')

// Sessions
ipcMain.handle('sessions:list', () => {
  try {
    return listSessions()
  } catch (err) {
    console.error('sessions:list error:', err)
    return []
  }
})

ipcMain.handle('sessions:create', (_event, data: { name?: string; provider: string; model: string }) => {
  try {
    return createSession(data)
  } catch (err) {
    console.error('sessions:create error:', err)
    throw err
  }
})

ipcMain.handle('sessions:delete', (_event, id: string) => {
  try {
    deleteSession(id)
  } catch (err) {
    console.error('sessions:delete error:', err)
    throw err
  }
})

ipcMain.handle('sessions:load', (_event, id: string) => {
  try {
    return loadSession(id)
  } catch (err) {
    console.error('sessions:load error:', err)
    throw err
  }
})

ipcMain.handle('sessions:save', (_event, { id, messages }: { id: string; messages: unknown[] }) => {
  try {
    saveSession(id, messages as Parameters<typeof saveSession>[1])
  } catch (err) {
    console.error('sessions:save error:', err)
    throw err
  }
})

// Session Export (TASK 3)
ipcMain.handle('session:export', async (_event, {
  sessionId, format,
}: { sessionId: string; format: 'markdown' | 'json' }) => {
  const { dialog } = await import('electron')
  const { session, messages } = loadSession(sessionId)

  let content: string
  let defaultName: string
  let filters: Array<{ name: string; extensions: string[] }>

  if (format === 'json') {
    content = JSON.stringify({ session, messages }, null, 2)
    defaultName = `${session.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.json`
    filters = [{ name: 'JSON', extensions: ['json'] }]
  } else {
    const lines: string[] = [
      `# ${session.name}`,
      ``,
      `**Provider:** ${session.provider} | **Model:** ${session.model}`,
      `**Date:** ${new Date(session.createdAt).toLocaleString()}`,
      ``,
      `---`,
      ``,
    ]
    for (const msg of messages) {
      const role = msg.role === 'user' ? '**You**' : '**Assistant**'
      const time = new Date(msg.timestamp).toLocaleTimeString()
      lines.push(`### ${role} · ${time}`)
      lines.push(``)
      lines.push(msg.content)
      if ((msg as any).tokenUsage?.totalTokens) {
        lines.push(``)
        lines.push(`*${(msg as any).tokenUsage.totalTokens.toLocaleString()} tokens*`)
      }
      lines.push(``)
      lines.push(`---`)
      lines.push(``)
    }
    content = lines.join('\n')
    defaultName = `${session.name.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.md`
    filters = [{ name: 'Markdown', extensions: ['md'] }]
  }

  const { filePath } = await dialog.showSaveDialog({ defaultPath: defaultName, filters })

  if (filePath) {
    writeFileSync(filePath, content, 'utf8')
    return { success: true, filePath }
  }
  return { success: false, cancelled: true }
})

// Settings
ipcMain.handle('settings:get', () => {
  try {
    const settings = getSettings()
    // Return settings with masked API keys
    const maskedKeys: Record<string, string> = {}
    for (const [provider, encrypted] of Object.entries(settings.apiKeys)) {
      if (encrypted.length > 0) {
        maskedKeys[provider] = 'sk-...' + encrypted.slice(-4)
      }
    }
    return { ...settings, apiKeys: maskedKeys }
  } catch (err) {
    console.error('settings:get error:', err)
    throw err
  }
})

ipcMain.handle('settings:set', (_event, updates: Record<string, unknown>) => {
  try {
    setSettings(updates as Parameters<typeof setSettings>[0])
  } catch (err) {
    console.error('settings:set error:', err)
    throw err
  }
})

// Auth
ipcMain.handle('auth:status', () => {
  try {
    return getAuthStatus()
  } catch (err) {
    console.error('auth:status error:', err)
    throw err
  }
})

ipcMain.handle('auth:setKey', (_event, { provider, key }: { provider: string; key: string }) => {
  try {
    const result = setApiKey(provider, key)
    return result
  } catch (err) {
    console.error('auth:setKey error:', err)
    throw err
  }
})

ipcMain.handle('auth:deleteKey', (_event, provider: string) => {
  try {
    deleteApiKey(provider)
  } catch (err) {
    console.error('auth:deleteKey error:', err)
    throw err
  }
})

// Chat
ipcMain.handle('chat:send', async (_event, {
  provider,
  model,
  messages,
  apiKey,
}: {
  provider: string
  model: string
  messages: Array<{ role: string; content: string }>
  apiKey?: string
}) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const controller = new AbortController()
  activeRequests.set(requestId, controller)

  // Run the chat request asynchronously
  ;(async () => {
    try {
      const resolvedApiKey = apiKey || getApiKey(provider) || ''
      let content = ''
      let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

      if (provider === 'openai' || provider === 'openrouter' || provider === 'qwen') {
        const result = await chatOpenAICompatible(provider, model, messages, resolvedApiKey, requestId, controller)
        content = result.content
        usage = result.usage
      } else if (provider === 'anthropic') {
        const result = await chatAnthropic(model, messages, resolvedApiKey, requestId, controller)
        content = result.content
        usage = result.usage
      } else if (provider === 'gemini') {
        const result = await chatGemini(model, messages, resolvedApiKey, requestId, controller)
        content = result.content
        usage = result.usage
      } else if (provider === 'copilot') {
        // Copilot uses OpenAI-compatible endpoint
        const result = await chatOpenAICompatible('copilot', model, messages, resolvedApiKey, requestId, controller)
        content = result.content
        usage = result.usage
      } else {
        throw new Error(`Unknown provider: ${provider}`)
      }

      if (mainWindow && !controller.signal.aborted) {
        mainWindow.webContents.send('chat:chunk', { requestId, content, done: true, usage })
      }
    } catch (err) {
      if (mainWindow && !controller.signal.aborted) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        mainWindow.webContents.send('chat:chunk', {
          requestId,
          content: `Error: ${errorMessage}`,
          done: true,
        })
      }
    } finally {
      activeRequests.delete(requestId)
    }
  })()

  return requestId
})

ipcMain.handle('chat:cancel', (_event, requestId: string) => {
  const controller = activeRequests.get(requestId)
  if (controller) {
    controller.abort()
    activeRequests.delete(requestId)
  }
})

// --- Chat implementations ---

async function chatOpenAICompatible(
  provider: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  requestId: string,
  controller: AbortController,
): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
  const baseURL = getProviderBaseUrl(provider)

  const client = new OpenAI({
    apiKey,
    baseURL,
    dangerouslyAllowBrowser: true,
  })

  const stream = await client.chat.completions.create(
    {
      model,
      messages: messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      })),
      stream: true,
      stream_options: { include_usage: true },
    },
    { signal: controller.signal },
  )

  let fullContent = ''
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) {
      fullContent += delta
      if (mainWindow && !controller.signal.aborted) {
        mainWindow.webContents.send('chat:chunk', { requestId, content: fullContent, done: false })
      }
    }
    // Track usage from final chunk
    if (chunk.usage) {
      usage.inputTokens = (chunk.usage as any).prompt_tokens ?? 0
      usage.outputTokens = (chunk.usage as any).completion_tokens ?? 0
      usage.totalTokens = (chunk.usage as any).total_tokens ?? 0
    }
  }
  return { content: fullContent, usage }
}

async function chatAnthropic(
  model: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  requestId: string,
  controller: AbortController,
): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
  const client = new Anthropic({
    apiKey,
  })

  // Convert messages to Anthropic format
  const systemMessage = messages.find((m) => m.role === 'system')
  const chatMessages = messages.filter((m) => m.role !== 'system')

  const stream = await client.messages.create(
    {
      model,
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: chatMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      stream: true,
    },
    { signal: controller.signal as never }, // Anthropic types differ slightly
  )

  let fullContent = ''
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  for await (const chunk of stream) {
    if (chunk.type === 'message_start' && (chunk as any).message?.usage) {
      usage.inputTokens = (chunk as any).message.usage.input_tokens ?? 0
    }
    if (chunk.type === 'message_delta' && (chunk as any).usage) {
      usage.outputTokens = (chunk as any).usage.output_tokens ?? 0
    }
    if (chunk.type === 'content_block_delta' && 'text' in chunk.delta) {
      fullContent += chunk.delta.text
      if (mainWindow && !controller.signal.aborted) {
        mainWindow.webContents.send('chat:chunk', { requestId, content: fullContent, done: false })
      }
    }
  }
  usage.totalTokens = usage.inputTokens + usage.outputTokens
  return { content: fullContent, usage }
}

async function chatGemini(
  model: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  requestId: string,
  controller: AbortController,
): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
  // Use Google Generative Language REST API
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`

  // Convert messages to Gemini format
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))

  const systemMessage = messages.find((m) => m.role === 'system')
  const body: Record<string, unknown> = { contents }
  if (systemMessage) {
    body.systemInstruction = { parts: [{ text: systemMessage.content }] }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: controller.signal,
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Gemini API error: ${error}`)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('No response body from Gemini')
  }

  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
          if (text) {
            fullContent += text
            if (mainWindow && !controller.signal.aborted) {
              mainWindow.webContents.send('chat:chunk', { requestId, content: fullContent, done: false })
            }
          }
          // Track usage from usageMetadata
          if (data.usageMetadata) {
            usage.inputTokens = data.usageMetadata.promptTokenCount ?? 0
            usage.outputTokens = data.usageMetadata.candidatesTokenCount ?? 0
            usage.totalTokens = data.usageMetadata.totalTokenCount ?? 0
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  }

  return { content: fullContent, usage }
}

function getProviderBaseUrl(provider: string): string | undefined {
  switch (provider) {
    case 'openai':
      return undefined // uses default OpenAI URL
    case 'openrouter':
      return 'https://openrouter.ai/api/v1'
    case 'qwen':
      return 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    case 'copilot':
      return 'https://api.githubcopilot.com'
    default:
      return undefined
  }
}

// ---------------------------------------------------------------------------
// CLI Session Manager (M7)
// ---------------------------------------------------------------------------

const cliManager = new CliSessionManager()

// Map of sessionId -> set of unsubscribe functions for stream callbacks (cleanup on session end)
const cliStreamUnsubs = new Map<string, Set<() => void>>()

ipcMain.handle('cli:detect', async () => {
  try {
    return await cliManager.detectCliBinaries()
  } catch (err) {
    console.error('cli:detect error:', err)
    return {}
  }
})

ipcMain.handle('cli:spawn', async (_event, { cliName, cwd, config }: {
  cliName: string
  cwd: string
  config?: { env?: Record<string, string>; extraArgs?: string[] }
}) => {
  try {
    const session = await cliManager.spawn(cliName, cwd, config)
    const sessionId = session.getInfo().sessionId

    // Wire up stream forwarding to renderer
    const unsubs = new Set<() => void>()

    const unsubStream = session.onStream((chunk) => {
      if (mainWindow) {
        mainWindow.webContents.send('cli:stream', { sessionId, chunk })
      }
    })
    unsubs.add(unsubStream)

    const unsubPerm = session.onPermissionRequest((req) => {
      if (mainWindow) {
        mainWindow.webContents.send('cli:permission', { sessionId, request: req })
      }
    })
    unsubs.add(unsubPerm)

    session.on('exit', () => {
      // Clean up subscriptions
      for (const unsub of unsubs) unsub()
      cliStreamUnsubs.delete(sessionId)
      if (mainWindow) {
        mainWindow.webContents.send('cli:exit', { sessionId })
      }
    })

    cliStreamUnsubs.set(sessionId, unsubs)

    return { sessionId }
  } catch (err) {
    console.error('cli:spawn error:', err)
    if (err instanceof CliError) {
      throw { message: err.message, kind: err.kind }
    }
    throw err
  }
})

ipcMain.handle('cli:prompt', (_event, { sessionId, text }: { sessionId: string; text: string }) => {
  try {
    const session = cliManager.getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    session.sendPrompt(text)
    return { ok: true }
  } catch (err) {
    console.error('cli:prompt error:', err)
    throw err
  }
})

ipcMain.handle('cli:terminate', async (_event, sessionId: string) => {
  try {
    // Clean up stream subscriptions
    const unsubs = cliStreamUnsubs.get(sessionId)
    if (unsubs) {
      for (const unsub of unsubs) unsub()
      cliStreamUnsubs.delete(sessionId)
    }
    await cliManager.terminateSession(sessionId)
    return { ok: true }
  } catch (err) {
    console.error('cli:terminate error:', err)
    throw err
  }
})

ipcMain.handle('cli:permission', (_event, { sessionId, requestId, allowed }: {
  sessionId: string
  requestId: string
  allowed: boolean
}) => {
  try {
    const session = cliManager.getSession(sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }
    session.grantPermission(requestId, allowed)
    return { ok: true }
  } catch (err) {
    console.error('cli:permission error:', err)
    throw err
  }
})

ipcMain.handle('cli:sessions:list', () => {
  try {
    return cliManager.getSessionsInfo()
  } catch (err) {
    console.error('cli:sessions:list error:', err)
    return []
  }
})

// ---------------------------------------------------------------------------
// MCP Server Manager (M11)
// ---------------------------------------------------------------------------

const mcpManager = new McpManager()

ipcMain.handle('mcp:list', () => {
  try {
    return mcpManager.listServers()
  } catch (err) {
    console.error('mcp:list error:', err)
    return []
  }
})

ipcMain.handle('mcp:start', async (_event, name: string) => {
  try {
    await mcpManager.startServer(name)
    return mcpManager.listServers().find((s) => s.name === name)
  } catch (err) {
    console.error('mcp:start error:', err)
    throw err
  }
})

ipcMain.handle('mcp:stop', async (_event, name: string) => {
  try {
    await mcpManager.stopServer(name)
    return mcpManager.listServers().find((s) => s.name === name)
  } catch (err) {
    console.error('mcp:stop error:', err)
    throw err
  }
})

ipcMain.handle('mcp:add', (_event, { name, config }: {
  name: string
  config: { command: string; args: string[]; env?: Record<string, string>; cwd?: string; timeout?: number }
}) => {
  try {
    mcpManager.addServer(name, config)
    return mcpManager.listServers().find((s) => s.name === name)
  } catch (err) {
    console.error('mcp:add error:', err)
    throw err
  }
})

ipcMain.handle('mcp:remove', async (_event, name: string) => {
  try {
    await mcpManager.removeServer(name)
    return { ok: true }
  } catch (err) {
    console.error('mcp:remove error:', err)
    throw err
  }
})

ipcMain.handle('mcp:tools', (_event, name: string) => {
  try {
    return mcpManager.getServerTools(name)
  } catch (err) {
    console.error('mcp:tools error:', err)
    throw err
  }
})

ipcMain.handle('mcp:callTool', async (_event, { serverName, toolName, args }: {
  serverName: string
  toolName: string
  args: Record<string, unknown>
}) => {
  try {
    return await mcpManager.callTool(serverName, toolName, args)
  } catch (err) {
    console.error('mcp:callTool error:', err)
    throw err
  }
})

// ---------------------------------------------------------------------------
// OAuth (M2+M3)
// ---------------------------------------------------------------------------

ipcMain.handle('auth:github-device', async () => {
  try {
    return await githubDeviceAuth()
  } catch (err) {
    console.error('auth:github-device error:', err)
    return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('auth:github-poll', async () => {
  try {
    return await githubPoll()
  } catch (err) {
    console.error('auth:github-poll error:', err)
    return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('auth:qwen-device', async () => {
  try {
    return await qwenDeviceAuth()
  } catch (err) {
    console.error('auth:qwen-device error:', err)
    return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('auth:qwen-poll', async () => {
  try {
    return await qwenPoll()
  } catch (err) {
    console.error('auth:qwen-poll error:', err)
    return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('auth:google-oauth', async (_event, start: boolean, port?: number) => {
  try {
    return await googleOAuth(start, port)
  } catch (err) {
    console.error('auth:google-oauth error:', err)
    return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('auth:import-gemini', async () => {
  try {
    return await importGeminiCliCredentials()
  } catch (err) {
    console.error('auth:import-gemini error:', err)
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ---------------------------------------------------------------------------
// Provider Registry (TASK 4)
// ---------------------------------------------------------------------------

ipcMain.handle('providers:list', async () => {
  try {
    const providers = await registry.getAvailable()
    return await Promise.all(providers.map(async (p) => ({
      id: p.id,
      name: p.name,
      models: await p.getModels(),
    })))
  } catch (err) {
    console.error('providers:list error:', err)
    return []
  }
})

// ---------------------------------------------------------------------------
// Device Flow Auth (TASK 2d)
// ---------------------------------------------------------------------------

ipcMain.handle('auth:connect', async (_event, { providerId }: { providerId: string }) => {
  try {
    if (providerId === 'github-copilot') {
      const deviceInfo = await initiateGitHubDeviceFlow()
      shell.openExternal(deviceInfo.verification_uri)
      return {
        providerId,
        user_code: deviceInfo.user_code,
        verification_uri: deviceInfo.verification_uri,
      }
    }
    // TODO: qwen device flow when endpoints available
    return { error: 'Provider not supported' }
  } catch (err) {
    console.error('auth:connect error:', err)
    return { error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('auth:connect-poll', async (_event, {
  providerId,
  device_code,
  interval,
}: {
  providerId: string
  device_code: string
  interval: number
}) => {
  try {
    if (providerId === 'github-copilot') {
      const controller = new AbortController()
      const result = await pollGitHubDeviceToken(device_code, interval, controller.signal)
      if ('access_token' in result) {
        setApiKey('github-copilot', result.access_token)
        if (mainWindow) {
          mainWindow.webContents.send('auth:status:update', { providerId: 'github-copilot', connected: true })
        }
      }
      return result
    }
    return { error: 'Provider not supported' }
  } catch (err) {
    console.error('auth:connect-poll error:', err)
    return { error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('auth:disconnect', (_event, { providerId }: { providerId: string }) => {
  try {
    deleteApiKey(providerId)
    if (mainWindow) {
      mainWindow.webContents.send('auth:status:update', { providerId, connected: false })
    }
  } catch (err) {
    console.error('auth:disconnect error:', err)
    throw err
  }
})

// ---------------------------------------------------------------------------
// Security (TASK 4c)
// ---------------------------------------------------------------------------

ipcMain.handle('security:isSecureMode', () => {
  return isSecureMode()
})

// ---------------------------------------------------------------------------
// File Operations (TASK 2)
// ---------------------------------------------------------------------------

ipcMain.handle('file:pick', async () => {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Supported', extensions: ['jpg','jpeg','png','gif','webp','txt','md','ts','tsx','js','py','json','html','css'] },
      { name: 'Images', extensions: ['jpg','jpeg','png','gif','webp'] },
      { name: 'Text Files', extensions: ['txt','md','ts','tsx','js','py','json','html','css'] },
    ],
  })
  return result.filePaths
})

ipcMain.handle('file:read', async (_event, filePath: string) => {
  const { readFileSync, statSync } = await import('fs')
  const { extname } = await import('path')
  const stat = statSync(filePath)
  if (stat.size > 10 * 1024 * 1024) throw new Error('File too large (max 10MB)')
  const ext = extname(filePath).toLowerCase()
  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf',
    '.txt': 'text/plain', '.md': 'text/markdown',
    '.ts': 'text/typescript', '.tsx': 'text/typescript',
    '.js': 'text/javascript', '.py': 'text/x-python',
    '.json': 'application/json', '.html': 'text/html', '.css': 'text/css',
  }
  const mimeType = mimeMap[ext] || 'application/octet-stream'
  const isText = mimeType.startsWith('text/') || mimeType === 'application/json'
  const name = filePath.split('/').at(-1) || 'unknown'
  if (isText) {
    return { type: 'text', content: readFileSync(filePath, 'utf8'), mimeType, name, size: stat.size }
  } else {
    return { type: 'image', content: readFileSync(filePath).toString('base64'), mimeType, name, size: stat.size }
  }
})

// ---------------------------------------------------------------------------
// Gemini Credential Import (TASK 5a)
// ---------------------------------------------------------------------------

ipcMain.handle('auth:import-gemini-creds', async () => {
  try {
    const { readFileSync, existsSync } = await import('fs')
    const { join } = await import('path')
    const { homedir } = await import('os')

    const credsPath = join(homedir(), '.gemini', 'oauth_creds.json')
    if (!existsSync(credsPath)) {
      return { success: false, error: 'Gemini CLI credentials not found at ~/.gemini/oauth_creds.json' }
    }

    const raw = readFileSync(credsPath, 'utf8')
    const creds = JSON.parse(raw) as Record<string, unknown>

    // Validate format
    if (!creds.access_token || !creds.refresh_token) {
      return { success: false, error: 'Invalid credential format: missing access_token or refresh_token' }
    }

    // Check expiry
    if (creds.expiry_date && (creds.expiry_date as number) < Date.now()) {
      // Try to refresh
      try {
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: creds.client_id,
            client_secret: creds.client_secret,
            refresh_token: creds.refresh_token,
            grant_type: 'refresh_token',
          }),
        })
        if (!refreshResponse.ok) {
          return { success: false, error: 'Token expired and refresh failed' }
        }
        const newTokens = await refreshResponse.json() as Record<string, unknown>
        // Update creds object
        Object.assign(creds, newTokens)
        creds.expiry_date = Date.now() + ((newTokens.expires_in as number) || 3600) * 1000
      } catch {
        return { success: false, error: 'Token expired and refresh failed' }
      }
    }

    // Store via safeStorage
    setApiKey('gemini', creds.access_token as string)

    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ---------------------------------------------------------------------------
// OAuth (M2+M3)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  initProviders({})
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// Graceful shutdown: stop all MCP servers
app.on('before-quit', async () => {
  try {
    await mcpManager.shutdown()
  } catch (err) {
    console.error('MCP shutdown error:', err)
  }
})
