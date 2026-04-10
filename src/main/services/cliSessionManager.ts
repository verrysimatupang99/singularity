import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { access, constants } from 'fs/promises'
import { env } from 'process'

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface CliConfig {
  cwd: string
  env?: Record<string, string>
  extraArgs?: string[]
}

export interface AgentCapabilities {
  name?: string
  version?: string
  [key: string]: unknown
}

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

type StreamCallback = (chunk: StreamChunk) => void
type PermissionCallback = (req: PermissionRequest) => void

// ---------------------------------------------------------------------------
// CLI Registry
// ---------------------------------------------------------------------------

export const CLI_REGISTRY: Record<string, { command: string; acpFlags: string[]; versionFlag: string }> = {
  claude: { command: 'claude', acpFlags: [], versionFlag: '--version' },
  qwen: { command: 'qwen', acpFlags: ['--acp'], versionFlag: '--version' },
  copilot: { command: 'copilot', acpFlags: ['--acp', '--stdio'], versionFlag: '--version' },
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

export class CliError extends Error {
  constructor(
    message: string,
    public readonly kind: 'spawn_failure' | 'auth_needed' | 'protocol_error' | 'terminated' | 'timeout',
  ) {
    super(message)
    this.name = 'CliError'
  }
}

function classifySpawnError(err: unknown, cliName: string): CliError {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('ENOENT') || msg.includes('not found')) {
    return new CliError(`CLI binary not found: "${cliName}". Make sure it is installed and in PATH.`, 'spawn_failure')
  }
  if (msg.includes('EACCES') || msg.includes('permission denied')) {
    return new CliError(`Permission denied when trying to run "${cliName}".`, 'spawn_failure')
  }
  if (msg.toLowerCase().includes('auth') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('login')) {
    return new CliError(`Authentication required for "${cliName}". Please configure your credentials first.`, 'auth_needed')
  }
  return new CliError(`Failed to spawn "${cliName}": ${msg}`, 'spawn_failure')
}

// ---------------------------------------------------------------------------
// Environment preparation
// ---------------------------------------------------------------------------

const CONFLICTING_ENV_PREFIXES = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'GEMINI_API_KEY',
  'COPILOT_',
  'QWEN_',
  'DASHSCOPE_',
]

export function prepareEnvironment(cliName: string, customEnv?: Record<string, string>): Record<string, string> {
  const cleaned: Record<string, string> = {}

  // Start with current process env
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      const upperKey = key.toUpperCase()
      const isConflicting = CONFLICTING_ENV_PREFIXES.some((prefix) => upperKey.startsWith(prefix))
      if (!isConflicting) {
        cleaned[key] = value
      }
    }
  }

  // Merge custom env (overrides cleaned env)
  if (customEnv) {
    Object.assign(cleaned, customEnv)
  }

  return cleaned
}

// ---------------------------------------------------------------------------
// ACP Message Parser
// ---------------------------------------------------------------------------

export class AcpParser {
  private buffer = ''

  feed(data: Buffer): (JsonRpcResponse | JsonRpcNotification)[] {
    this.buffer += data.toString('utf8')
    const messages: (JsonRpcResponse | JsonRpcNotification)[] = []
    const lines = this.buffer.split('\n')

    // Keep the last (potentially incomplete) line in the buffer
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed) as JsonRpcResponse | JsonRpcNotification
        messages.push(parsed)
      } catch {
        // Skip non-JSON lines (e.g. debug output from CLI)
      }
    }

    return messages
  }

  /** Drain remaining buffer (useful before process exit) */
  flush(): (JsonRpcResponse | JsonRpcNotification)[] {
    const remaining = this.buffer.trim()
    this.buffer = ''
    if (!remaining) return []
    try {
      return [JSON.parse(remaining) as JsonRpcResponse | JsonRpcNotification]
    } catch {
      return []
    }
  }
}

// ---------------------------------------------------------------------------
// CliSession
// ---------------------------------------------------------------------------

export class CliSession extends EventEmitter {
  private process: ChildProcess | null = null
  private sessionId: string
  private cliName: string
  private cwd: string
  private status: CliSessionInfo['status'] = 'initializing'
  private parser = new AcpParser()
  private pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>()
  private messageId = 0
  private streamCallbacks = new Set<StreamCallback>()
  private permissionCallbacks = new Set<PermissionCallback>()
  private error?: string

  constructor(sessionId: string, cliName: string, cwd: string) {
    super()
    this.sessionId = sessionId
    this.cliName = cliName
    this.cwd = cwd
  }

  // -- Internal helpers --

  private nextId(): number {
    return ++this.messageId
  }

  private sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.process?.stdin) {
      return Promise.reject(new CliError(`Session "${this.sessionId}" is not active.`, 'terminated'))
    }

    const id = this.nextId()
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    this.process.stdin.write(JSON.stringify(request) + '\n')

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
    })
  }

  private handleMessage(msg: JsonRpcResponse | JsonRpcNotification): void {
    // Check if it's a response to a pending request
    if ('id' in msg && msg.id !== undefined && msg.id !== null) {
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        this.pendingRequests.delete(msg.id)
        if (msg.error) {
          pending.reject(new CliError(msg.error.message, 'protocol_error'))
        } else {
          pending.resolve(msg.result)
        }
        return
      }
    }

    // It's a notification
    if ('method' in msg && msg.method) {
      this.handleNotification(msg)
    }
  }

  private handleNotification(notification: JsonRpcNotification): void {
    const { method, params } = notification

    if (method === 'session/update' && params) {
      const updateType = (params.type as string) || ''

      if (updateType === 'agent_message_chunk' || updateType === 'agent_thought_chunk') {
        const chunk: StreamChunk = {
          type: updateType as StreamChunk['type'],
          content: params.content as { type: string; text: string } | undefined,
        }
        this.streamCallbacks.forEach((cb) => cb(chunk))
      } else if (updateType === 'tool_call') {
        const chunk: StreamChunk = {
          type: 'tool_call',
          toolCall: params.toolCall as StreamChunk['toolCall'],
        }
        this.streamCallbacks.forEach((cb) => cb(chunk))
      } else if (updateType === 'end_turn') {
        const chunk: StreamChunk = {
          type: 'end_turn',
          stopReason: params.stopReason as StreamChunk['stopReason'],
          errorMessage: params.error as string | undefined,
        }
        this.status = 'ready'
        this.streamCallbacks.forEach((cb) => cb(chunk))
      } else if (updateType === 'request_permission') {
        const req: PermissionRequest = {
          requestId: String(params.requestId ?? ''),
          toolCall: params.toolCall as PermissionRequest['toolCall'],
          options: (params.options as PermissionRequest['options']) || [{ mode: 'allow_once' }],
        }
        this.permissionCallbacks.forEach((cb) => cb(req))
      }
    }
  }

  // -- Public API --

  /** Initialize the ACP connection. Called internally by CliSessionManager after spawn. */
  async initialize(): Promise<AgentCapabilities> {
    const result = await this.sendRequest('initialize', {}) as Record<string, unknown> | undefined
    return (result ?? {}) as AgentCapabilities
  }

  /** Create an ACP session. Called internally by CliSessionManager. */
  async createSession(): Promise<void> {
    await this.sendRequest('session/new', { cwd: this.cwd })
    this.status = 'ready'
  }

  getInfo(): CliSessionInfo {
    return {
      sessionId: this.sessionId,
      cliName: this.cliName,
      cwd: this.cwd,
      status: this.status,
      error: this.error,
    }
  }

  get cli(): ChildProcess | null {
    return this.process
  }

  /** Attach to an already-spawned child process and wire up stdout/stderr. */
  attach(proc: ChildProcess): void {
    this.process = proc

    proc.stdout?.on('data', (data: Buffer) => {
      const messages = this.parser.feed(data)
      for (const msg of messages) {
        this.handleMessage(msg)
      }
    })

    proc.stderr?.on('data', (data: Buffer) => {
      // Log stderr for debugging; do not treat as ACP messages
      process.stderr.write(`[${this.cliName}] ${data.toString('utf8')}`)
    })

    proc.on('exit', (code, signal) => {
      // Flush remaining parser buffer
      const remaining = this.parser.flush()
      for (const msg of remaining) {
        this.handleMessage(msg)
      }

      if (this.status !== 'terminated') {
        this.status = 'error'
        this.error = `Process exited with code ${code ?? 'null'}, signal ${signal ?? 'null'}`
        this.emit('exit', { code, signal })

        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          pending.reject(new CliError(`CLI process exited unexpectedly (code: ${code}, signal: ${signal})`, 'terminated'))
        }
        this.pendingRequests.clear()
      }
    })

    proc.on('error', (err) => {
      this.status = 'error'
      this.error = err.message
      this.emit('error', err)
    })
  }

  /** Send a text prompt to the CLI session. */
  sendPrompt(text: string): void {
    if (this.status === 'error' || this.status === 'terminated') {
      throw new CliError(`Cannot send prompt: session is ${this.status}`, 'terminated')
    }
    this.status = 'streaming'
    this.sendRequest('session/prompt', {
      sessionId: this.sessionId,
      prompt: [{ type: 'text', text }],
    }).catch(() => {
      // Errors are handled via stream updates (end_turn with error)
    })
  }

  /** Register a callback for streaming updates. Returns an unsubscribe function. */
  onStream(callback: StreamCallback): () => void {
    this.streamCallbacks.add(callback)
    return () => {
      this.streamCallbacks.delete(callback)
    }
  }

  /** Register a callback for permission requests. Returns an unsubscribe function. */
  onPermissionRequest(callback: PermissionCallback): () => void {
    this.permissionCallbacks.add(callback)
    return () => {
      this.permissionCallbacks.delete(callback)
    }
  }

  /** Respond to a permission request. */
  grantPermission(requestId: string, allowed: boolean): void {
    this.sendRequest('session/permission', {
      requestId,
      allowed,
    }).catch((err) => {
      console.error(`Failed to grant permission for request ${requestId}:`, err)
    })
  }

  /** Terminate this CLI session. */
  async terminate(): Promise<void> {
    this.status = 'terminated'

    // Try graceful shutdown via SIGTERM
    if (this.process?.pid) {
      try {
        process.kill(this.process.pid, 'SIGTERM')
      } catch {
        // Process already dead
      }
    }

    // Force kill after timeout
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (this.process?.pid) {
          try {
            process.kill(this.process.pid, 'SIGKILL')
          } catch {
            // Already dead
          }
        }
        resolve()
      }, 3000)

      if (this.process) {
        this.process.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      } else {
        clearTimeout(timer)
        resolve()
      }
    })

    // Reject pending requests
    for (const pending of this.pendingRequests.values()) {
      pending.reject(new CliError('Session terminated', 'terminated'))
    }
    this.pendingRequests.clear()
    this.streamCallbacks.clear()
    this.permissionCallbacks.clear()
  }
}

// ---------------------------------------------------------------------------
// CliSessionManager
// ---------------------------------------------------------------------------

export class CliSessionManager {
  private sessions = new Map<string, CliSession>()

  /** Scan PATH for known CLI binaries. */
  async detectCliBinaries(): Promise<Record<string, string>> {
    const available: Record<string, string> = {}

    for (const [name, config] of Object.entries(CLI_REGISTRY)) {
      try {
        // Try running with version flag to verify it exists
        await access(config.command, constants.X_OK)
        // Get version
        const version = await this.getCliVersion(config.command, config.versionFlag)
        available[name] = version
      } catch {
        // Not available
      }
    }

    return available
  }

  private async getCliVersion(command: string, versionFlag: string): Promise<string> {
    return new Promise((resolve) => {
      const proc = spawn(command, [versionFlag], { timeout: 5000 })
      let output = ''
      proc.stdout?.on('data', (d: Buffer) => { output += d.toString('utf8') })
      proc.stderr?.on('data', (d: Buffer) => { output += d.toString('utf8') })
      proc.on('close', () => {
        resolve(output.trim().split('\n')[0] || 'unknown')
      })
      proc.on('error', () => resolve('unknown'))
    })
  }

  /** Spawn a new CLI process and initialize ACP session. */
  async spawn(cliName: string, cwd: string, config?: Partial<CliConfig>): Promise<CliSession> {
    const registryEntry = CLI_REGISTRY[cliName]
    if (!registryEntry) {
      throw new CliError(`Unknown CLI: "${cliName}". Supported: ${Object.keys(CLI_REGISTRY).join(', ')}`, 'spawn_failure')
    }

    const sessionId = `cli_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const env = prepareEnvironment(cliName, config?.env)

    const args = [...registryEntry.acpFlags, ...(config?.extraArgs ?? [])]

    let child: ChildProcess
    try {
      child = spawn(registryEntry.command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: config?.cwd ?? cwd,
        env,
      })
    } catch (err) {
      throw classifySpawnError(err, cliName)
    }

    const session = new CliSession(sessionId, cliName, cwd)
    session.attach(child)
    this.sessions.set(sessionId, session)

    try {
      // Initialize ACP protocol
      await session.initialize()
      // Create session with cwd
      await session.createSession()
    } catch (err) {
      await session.terminate()
      this.sessions.delete(sessionId)
      if (err instanceof CliError) throw err
      throw new CliError(`Failed to initialize ACP for "${cliName}": ${err instanceof Error ? err.message : String(err)}`, 'protocol_error')
    }

    return session
  }

  /** Get an existing session by ID. */
  getSession(sessionId: string): CliSession | undefined {
    return this.sessions.get(sessionId)
  }

  /** Terminate and remove a session. */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return
    await session.terminate()
    this.sessions.delete(sessionId)
  }

  /** List all active session IDs. */
  listSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  /** Get info about all sessions. */
  getSessionsInfo(): CliSessionInfo[] {
    return Array.from(this.sessions.values()).map((s) => s.getInfo())
  }
}
