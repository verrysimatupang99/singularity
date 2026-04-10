import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync } from 'fs'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import * as pty from 'node-pty'
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
  isFirstRun,
  markOnboardingComplete,
} from './services/storage.js'
import { crashReporter } from './services/crashReporter.js'
import { CliSessionManager, CliError } from './services/cliSessionManager.js'
import { McpManager } from './services/mcpManager.js'
import { initProviders, registry } from './providers/index.js'
import { applyUnifiedDiff, countDiffLines, parseDiffHunks, generateUnifiedDiff } from './utils/diff.js'
import { runAgentLoop, approveAgent } from './services/agentRunner.js'
import { OrchestratorAgent } from './services/orchestrator.js'
import { tokenOptimizer } from './services/tokenOptimizer.js'
import { agentMemory } from './services/agentMemory.js'
import {
  githubDeviceAuth,
  githubPoll,
  qwenDeviceAuth,
  qwenPoll,
  googleOAuth,
  importGeminiCliCredentials,
  initiateGitHubDeviceFlow,
  pollGitHubDeviceToken,
  validateQwenApiKey,
  openQwenApiKeyPage,
  validateGeminiApiKey,
  googleOAuthWithClientId,
} from './services/oauthService.js'
import { pluginLoader } from './services/pluginLoader.js'
import { computerUseController } from './services/computerUse.js'
import { setupAutoUpdater } from './services/updater.js'

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

ipcMain.handle('auth:validate-qwen', async (_event, apiKey: string) => {
  try {
    return await validateQwenApiKey(apiKey)
  } catch (err) {
    console.error('auth:validate-qwen error:', err)
    return { valid: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('auth:open-qwen-console', async () => {
  try {
    await openQwenApiKeyPage()
    return { ok: true }
  } catch (err) {
    console.error('auth:open-qwen-console error:', err)
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('auth:validate-gemini', async (_event, apiKey: string) => validateGeminiApiKey(apiKey))
ipcMain.handle('auth:google-oauth-start', async (_event, clientId: string) => googleOAuthWithClientId(clientId, true))
ipcMain.handle('auth:google-oauth-stop', async (_event, clientId: string) => googleOAuthWithClientId(clientId, false))
ipcMain.handle('auth:open-google-cloud-console', async () => {
  const { shell } = await import('electron')
  await shell.openExternal('https://console.cloud.google.com/apis/credentials')
  return { ok: true }
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
// AI Diff Apply (TASK 5)
// ---------------------------------------------------------------------------

ipcMain.handle('ai:applyDiff', async (_event, { filePath, diff }: { filePath: string; diff: string }) => {
  const { readFileSync, writeFileSync } = await import('fs')
  try {
    const original = readFileSync(filePath, 'utf8')
    const applied = applyUnifiedDiff(original, diff)
    writeFileSync(filePath, applied, 'utf8')
    const lines = countDiffLines(diff)
    return { success: true, linesChanged: lines }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('ai:previewDiff', async (_event, { filePath, diff }: { filePath: string; diff: string }) => {
  const { readFileSync } = await import('fs')
  try {
    const original = readFileSync(filePath, 'utf8')
    const hunks = parseDiffHunks(diff)
    return {
      filePath,
      hunks,
      originalLines: original.split('\n').length,
      totalAdded: hunks.reduce((sum, h) => sum + h.additions, 0),
      totalRemoved: hunks.reduce((sum, h) => sum + h.deletions, 0),
      original,
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
})

ipcMain.handle('ai:generateDiff', async (_event, { filePath, newContent }: { filePath: string; newContent: string }) => {
  const { readFileSync } = await import('fs')
  try {
    const original = readFileSync(filePath, 'utf8')
    const diff = generateUnifiedDiff(filePath, filePath, original, newContent)
    return { success: true, diff }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ---------------------------------------------------------------------------
// File Operations (TASK 2)
// ---------------------------------------------------------------------------

// fs:pickFolder — open directory picker
ipcMain.handle('fs:pickFolder', async () => {
  const { dialog } = await import('electron')
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
    title: 'Open Workspace Folder',
  })
  return result.filePaths[0] || null
})

// fs:readDir — read directory contents (one level)
ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
  const { readdirSync, statSync } = await import('fs')
  const { join } = await import('path')

  const IGNORED = new Set([
    'node_modules', '.git', '.next', 'dist', 'build',
    '.cache', 'coverage', '.nyc_output', '__pycache__',
    '.DS_Store', 'Thumbs.db',
  ])

  try {
    const entries = readdirSync(dirPath)
    return entries
      .filter((name) => !IGNORED.has(name) && !name.startsWith('.'))
      .map((name) => {
        const fullPath = join(dirPath, name)
        const stat = statSync(fullPath)
        return {
          name,
          path: fullPath,
          type: stat.isDirectory() ? 'dir' : 'file' as const,
          size: stat.isFile() ? stat.size : 0,
          ext: stat.isFile() ? name.split('.').at(-1) || '' : '',
        }
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch {
    return []
  }
})

// fs:readFile — read file content (text)
ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
  const { readFileSync, statSync } = await import('fs')
  const stat = statSync(filePath)
  if (stat.size > 2 * 1024 * 1024) {
    throw new Error('File too large for editor (max 2MB)')
  }
  return readFileSync(filePath, 'utf8')
})

// fs:writeFile — write file content
ipcMain.handle('fs:writeFile', async (_event, { filePath, content }: { filePath: string; content: string }) => {
  const { writeFileSync, mkdirSync } = await import('fs')
  const { dirname } = await import('path')
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
  return { success: true }
})

// fs:search — search across files using ripgrep or grep
ipcMain.handle('fs:search', async (_event, {
  pattern, directory, options,
}: {
  pattern: string
  directory: string
  options: { caseSensitive: boolean; useRegex: boolean; filePattern?: string }
}) => {
  const { execSync } = await import('child_process')
  const { existsSync } = await import('fs')

  if (!existsSync(directory)) return []

  const rgAvailable = (() => {
    try { execSync('rg --version', { timeout: 1000 }); return true }
    catch { return false }
  })()

  const flags = [
    '--line-number',
    '--with-filename',
    '--no-heading',
    options.caseSensitive ? '' : '--ignore-case',
    options.useRegex ? '' : '--fixed-strings',
    options.filePattern ? `--glob '${options.filePattern}'` : '',
    '--glob !node_modules',
    '--glob !.git',
    '--glob !dist',
    '--glob !build',
    pattern,
    directory,
  ].filter(Boolean)

  try {
    const cmd = rgAvailable ? `rg ${flags.join(' ')}` : `grep -rn ${flags.join(' ')}`
    const output = execSync(cmd, { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }).toString()

    return output.trim().split('\n').filter(Boolean).map((line) => {
      const parts = line.split(':')
      return {
        file: parts[0]?.trim() || '',
        line: parseInt(parts[1] || '0'),
        content: parts.slice(2).join(':').trim(),
      }
    }).slice(0, 500)
  } catch {
    return []
  }
})

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
// Terminal (TASK 4)
// ---------------------------------------------------------------------------

const terminals = new Map<string, pty.IPty>()

ipcMain.handle('terminal:create', (_event, { cwd, shell }: { cwd: string; shell?: string }) => {
  const termId = `term_${Date.now()}`
  const defaultShell = process.platform === 'win32'
    ? process.env.COMSPEC || 'cmd.exe'
    : process.env.SHELL || '/bin/bash'
  const args = process.platform === 'win32' ? [] : ['--login']

  const term = pty.spawn(shell || defaultShell, args, {
    name: 'xterm-256color',
    cwd: cwd || process.cwd(),
    env: process.env as Record<string, string>,
    cols: 80,
    rows: 24,
  })

  term.onData((data) => {
    if (mainWindow) {
      mainWindow.webContents.send('terminal:data', { termId, data })
    }
  })

  term.onExit(({ exitCode }) => {
    terminals.delete(termId)
    if (mainWindow) {
      mainWindow.webContents.send('terminal:exit', { termId, exitCode })
    }
  })

  terminals.set(termId, term)
  return { termId }
})

ipcMain.handle('terminal:write', (_event, { termId, data }: { termId: string; data: string }) => {
  const term = terminals.get(termId)
  if (term) {
    term.write(data)
    return { ok: true }
  }
  return { ok: false, error: 'Terminal not found' }
})

ipcMain.handle('terminal:resize', (_event, { termId, cols, rows }: { termId: string; cols: number; rows: number }) => {
  const term = terminals.get(termId)
  if (term) {
    term.resize(cols, rows)
    return { ok: true }
  }
  return { ok: false }
})

ipcMain.handle('terminal:kill', (_event, termId: string) => {
  const term = terminals.get(termId)
  if (term) {
    term.kill()
    terminals.delete(termId)
  }
  return { ok: true }
})

// ---------------------------------------------------------------------------
// Token Optimizer & Memory (Phase 6 - TASK 2 & TASK 5)
// ---------------------------------------------------------------------------

ipcMain.handle('optimizer:compress', async (_event, { messages, strategy, keepLast, provider, model }: {
  messages: any[]
  strategy: string
  keepLast?: number
  provider?: string
  model?: string
}) => {
  if (strategy === 'rolling') return await tokenOptimizer.rollingSummary(messages, keepLast, provider, model)
  if (strategy === 'truncate') return tokenOptimizer.truncateToFit(messages, 50000)
  if (strategy === 'deduplicate') return tokenOptimizer.deduplicateFileAttachments(messages)
  return messages
})

ipcMain.handle('optimizer:estimate', (_event, messages: any[]) => {
  const chars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0)
  return { estimatedTokens: Math.ceil(chars / 4), messageCount: messages.length }
})

ipcMain.handle('memory:get', () => agentMemory.getAll())
ipcMain.handle('memory:forget', (_event, key: string) => { agentMemory.forget(key); return { ok: true } })

// ---------------------------------------------------------------------------
// Agent (Phase 6 - TASK 3)
// ---------------------------------------------------------------------------

ipcMain.handle('agent:executeTask', async (_event, { task, workspaceRoot, provider, model }: { task: string; workspaceRoot: string; provider: string; model: string }) => {
  const agentId = `agent_${Date.now()}`
  ;(async () => {
    await runAgentLoop({ agentId, task, workspaceRoot, provider, model, onEvent: (event) => mainWindow?.webContents.send('agent:event', event) })
  })()
  return { agentId }
})

ipcMain.handle('agent:approve', (_event, { agentId, approved }: { agentId: string; approved: boolean }) => {
  approveAgent(agentId, approved)
  return { ok: true }
})

// ---------------------------------------------------------------------------
// Orchestrator (Phase 7 - TASK 1)
// ---------------------------------------------------------------------------

const activeOrchestrators = new Map<string, OrchestratorAgent>()

ipcMain.handle('orchestrator:plan', async (_event, { task, workspaceRoot, provider, model }: { task: string; workspaceRoot: string; provider: string; model: string }) => {
  const orchId = `orch_${Date.now()}`
  const orch = new OrchestratorAgent({ orchestratorId: orchId, task, workspaceRoot, provider, model, onEvent: () => {} })
  const plan = await orch.plan(task)
  activeOrchestrators.set(orchId, orch)
  return plan
})

ipcMain.handle('orchestrator:execute', async (_event, { plan, workspaceRoot, provider, model }: { plan: any; workspaceRoot: string; provider: string; model: string }) => {
  const orchId = plan.orchestratorId
  const existing = activeOrchestrators.get(orchId)
  const orch = existing || new OrchestratorAgent({ orchestratorId: orchId, task: plan.task, workspaceRoot, provider, model, onEvent: (e) => mainWindow?.webContents.send('orchestrator:event', e) })
  if (!existing) activeOrchestrators.set(orchId, orch)
  ;(async () => {
    try {
      await orch.execute(plan)
      mainWindow?.webContents.send('orchestrator:done', { orchestratorId: orchId })
    } catch (err: any) {
      mainWindow?.webContents.send('orchestrator:error', { orchestratorId: orchId, error: err.message })
    }
  })()
  return { orchestratorId: orchId }
})

// ---------------------------------------------------------------------------
// Plugin System (Phase 7 - TASK 3)
// ---------------------------------------------------------------------------

ipcMain.handle('plugins:list', () => pluginLoader.getLoadedPlugins().map(p => ({ name: p.name, version: p.version, toolCount: p.tools.length })))
ipcMain.handle('plugins:install', async (_event, pluginDir: string) => pluginLoader.installPlugin(pluginDir))
ipcMain.handle('plugins:unload', (_event, name: string) => { pluginLoader.unloadPlugin(name); return { ok: true } })
ipcMain.handle('plugins:fetchRegistry', async (_event, url?: string) => pluginLoader.fetchRegistry(url))
ipcMain.handle('plugins:installFromRegistry', async (_event, entry: any) => pluginLoader.installFromRegistry(entry))

// ---------------------------------------------------------------------------
// Computer Use (Phase 7 - TASK 4)
// ---------------------------------------------------------------------------

ipcMain.handle('cu:screenshot', async () => computerUseController.screenshot())
ipcMain.handle('cu:action', async (_event, action: any) => {
  if (action.type === 'screenshot') return computerUseController.screenshot()
  return { success: false, error: `Action '${action.type}' not yet implemented (planned Phase 8)` }
})

// ---------------------------------------------------------------------------
// Crash Reporter (Phase 8 - TASK 3)
// ---------------------------------------------------------------------------

ipcMain.handle('crash:report', (_event, report: any) => crashReporter.save(report))
ipcMain.handle('crash:list', () => crashReporter.list())

// ---------------------------------------------------------------------------
// Onboarding (Phase 8 - TASK 2)
// ---------------------------------------------------------------------------

ipcMain.handle('storage:markOnboardingComplete', () => {
  markOnboardingComplete()
  return { ok: true }
})
ipcMain.handle('storage:isFirstRun', () => isFirstRun())

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  initProviders({})
  // Load plugins on startup
  try { await pluginLoader.loadFromDir(pluginLoader['pluginDir']) } catch {}
  createWindow()
  if (mainWindow) {
    setupAutoUpdater(mainWindow)
  }
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
