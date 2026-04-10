import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
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

      if (provider === 'openai' || provider === 'openrouter' || provider === 'qwen') {
        content = await chatOpenAICompatible(provider, model, messages, resolvedApiKey, requestId, controller)
      } else if (provider === 'anthropic') {
        content = await chatAnthropic(model, messages, resolvedApiKey, requestId, controller)
      } else if (provider === 'gemini') {
        content = await chatGemini(model, messages, resolvedApiKey, requestId, controller)
      } else if (provider === 'copilot') {
        // Copilot uses OpenAI-compatible endpoint
        content = await chatOpenAICompatible('copilot', model, messages, resolvedApiKey, requestId, controller)
      } else {
        throw new Error(`Unknown provider: ${provider}`)
      }

      if (mainWindow && !controller.signal.aborted) {
        mainWindow.webContents.send('chat:chunk', { requestId, content, done: true })
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
): Promise<string> {
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
    },
    { signal: controller.signal },
  )

  let fullContent = ''
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) {
      fullContent += delta
      if (mainWindow && !controller.signal.aborted) {
        mainWindow.webContents.send('chat:chunk', { requestId, content: fullContent, done: false })
      }
    }
  }
  return fullContent
}

async function chatAnthropic(
  model: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  requestId: string,
  controller: AbortController,
): Promise<string> {
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
  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && 'text' in chunk.delta) {
      fullContent += chunk.delta.text
      if (mainWindow && !controller.signal.aborted) {
        mainWindow.webContents.send('chat:chunk', { requestId, content: fullContent, done: false })
      }
    }
  }
  return fullContent
}

async function chatGemini(
  model: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  requestId: string,
  controller: AbortController,
): Promise<string> {
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
        } catch {
          // Skip unparseable lines
        }
      }
    }
  }

  return fullContent
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
