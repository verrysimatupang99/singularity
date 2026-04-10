import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { env } from 'process'

// ---------------------------------------------------------------------------
// MCP JSON-RPC types (aligned with ACP types since both use JSON-RPC 2.0)
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string }
}

// ---------------------------------------------------------------------------
// Domain types
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
// MCP Line Parser
// ---------------------------------------------------------------------------

class McpLineParser {
  private buffer = ''

  feed(data: Buffer): JsonRpcResponse[] {
    this.buffer += data.toString('utf8')
    const messages: JsonRpcResponse[] = []
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const parsed = JSON.parse(trimmed) as JsonRpcResponse
        messages.push(parsed)
      } catch {
        // Skip non-JSON lines
      }
    }
    return messages
  }

  flush(): JsonRpcResponse[] {
    const remaining = this.buffer.trim()
    this.buffer = ''
    if (!remaining) return []
    try {
      return [JSON.parse(remaining) as JsonRpcResponse]
    } catch {
      return []
    }
  }
}

// ---------------------------------------------------------------------------
// McpServerInstance (internal — one per configured server)
// ---------------------------------------------------------------------------

class McpServerInstance extends EventEmitter {
  private process: ChildProcess | null = null
  private parser = new McpLineParser()
  private pendingRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void; timer?: ReturnType<typeof setTimeout> }>()
  private messageId = 0
  private tools: McpTool[] = []
  private _status: McpServerInfo['status'] = 'stopped'
  private error?: string
  private restartCount = 0
  private maxRestarts = 3
  private restartTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    readonly name: string,
    readonly config: McpServerConfig,
  ) {
    super()
  }

  get status(): McpServerInfo['status'] {
    return this._status
  }

  getTools(): McpTool[] {
    return [...this.tools]
  }

  getInfo(): McpServerInfo {
    return {
      name: this.name,
      config: this.config,
      status: this._status,
      tools: this.getTools(),
      error: this.error,
    }
  }

  // -- Internal helpers --

  private nextId(): number {
    return ++this.messageId
  }

  private sendRequest(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    if (!this.process?.stdin) {
      return Promise.reject(new Error(`MCP server "${this.name}" is not running (status: ${this._status})`))
    }

    const id = this.nextId()
    const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params }
    this.process.stdin.write(JSON.stringify(request) + '\n')

    return new Promise((resolve, reject) => {
      const timer = timeoutMs
        ? setTimeout(() => {
            this.pendingRequests.delete(id)
            reject(new Error(`MCP request "${method}" timed out after ${timeoutMs}ms`))
          }, timeoutMs)
        : undefined

      this.pendingRequests.set(id, { resolve, reject, timer })
    })
  }

  private handleMessage(msg: JsonRpcResponse): void {
    if (msg.id === undefined || msg.id === null) return

    const pending = this.pendingRequests.get(msg.id)
    if (!pending) return

    this.pendingRequests.delete(msg.id)
    if (pending.timer) clearTimeout(pending.timer)

    if (msg.error) {
      pending.reject(new Error(msg.error.message))
    } else {
      pending.resolve(msg.result)
    }
  }

  private scheduleRestart(): void {
    if (this.restartCount >= this.maxRestarts) {
      this._status = 'error'
      this.error = `Server crashed ${this.maxRestarts} times, giving up.`
      this.emit('statusChange', this.getInfo())
      return
    }

    this.restartCount++
    this._status = 'starting'
    this.error = `Restarting... (${this.restartCount}/${this.maxRestarts})`
    this.emit('statusChange', this.getInfo())

    const delay = Math.min(1000 * Math.pow(2, this.restartCount - 1), 10000)
    this.restartTimer = setTimeout(() => {
      this.spawn().catch((err) => {
        this.error = `Restart failed: ${err instanceof Error ? err.message : String(err)}`
        this._status = 'error'
        this.emit('statusChange', this.getInfo())
      })
    }, delay)
  }

  // -- Lifecycle --

  async start(): Promise<void> {
    if (this._status === 'running' || this._status === 'starting') return

    this._status = 'starting'
    this.error = undefined
    this.restartCount = 0
    this.emit('statusChange', this.getInfo())

    await this.spawn()
  }

  private async spawn(): Promise<void> {
    // Clean environment
    const procEnv: Record<string, string> = {}
    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) procEnv[key] = value
    }
    if (this.config.env) {
      Object.assign(procEnv, this.config.env)
    }

    let child: ChildProcess
    try {
      child = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: this.config.cwd,
        env: procEnv,
      })
    } catch (err) {
      this._status = 'error'
      this.error = `Spawn failed: ${err instanceof Error ? err.message : String(err)}`
      this.emit('statusChange', this.getInfo())
      throw err
    }

    this.process = child

    // Wire stdout parser
    child.stdout?.on('data', (data: Buffer) => {
      const messages = this.parser.feed(data)
      for (const msg of messages) {
        this.handleMessage(msg)
      }
    })

    // Log stderr (do NOT parse as JSON-RPC)
    child.stderr?.on('data', (data: Buffer) => {
      process.stderr.write(`[MCP:${this.name}] ${data.toString('utf8')}`)
    })

    // Handle process exit
    child.on('exit', (code, signal) => {
      // Flush parser
      const remaining = this.parser.flush()
      for (const msg of remaining) {
        this.handleMessage(msg)
      }

      if (this._status !== 'stopped') {
        this._status = 'error'
        this.error = `Process exited (code: ${code ?? 'null'}, signal: ${signal ?? 'null'})`

        // Reject pending requests
        for (const [id, pending] of this.pendingRequests) {
          this.pendingRequests.delete(id)
          if (pending.timer) clearTimeout(pending.timer)
          pending.reject(new Error(`MCP server process exited unexpectedly`))
        }

        this.emit('statusChange', this.getInfo())
        this.scheduleRestart()
      }
    })

    child.on('error', (err) => {
      this._status = 'error'
      this.error = err.message
      this.emit('statusChange', this.getInfo())
    })

    // Initialize MCP protocol
    try {
      const timeout = this.config.timeout ?? 10000
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'Singularity', version: '0.1.0' },
      }, timeout)

      // Send initialized notification (MCP requires this after initialize)
      if (child.stdin) {
        child.stdin.write(JSON.stringify({
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        }) + '\n')
      }

      // Discover tools
      await this.discoverTools(timeout)

      this._status = 'running'
      this.error = undefined
      this.emit('statusChange', this.getInfo())
    } catch (err) {
      this._status = 'error'
      this.error = `Initialization failed: ${err instanceof Error ? err.message : String(err)}`
      this.emit('statusChange', this.getInfo())
      // Kill the process
      this.killProcess()
      throw err
    }
  }

  private async discoverTools(timeout: number): Promise<void> {
    try {
      const result = await this.sendRequest('tools/list', {}, timeout) as { tools?: McpTool[] } | null
      if (result?.tools) {
        this.tools = result.tools
      } else {
        this.tools = []
      }
    } catch {
      this.tools = []
    }
  }

  async stop(): Promise<void> {
    // Clear restart timer
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    this._status = 'stopped'
    this.killProcess()

    // Reject pending requests
    for (const [id, pending] of this.pendingRequests) {
      this.pendingRequests.delete(id)
      if (pending.timer) clearTimeout(pending.timer)
      pending.reject(new Error('Server stopped'))
    }

    this.emit('statusChange', this.getInfo())
  }

  private killProcess(): void {
    if (!this.process) return

    if (this.process.pid) {
      try {
        process.kill(this.process.pid, 'SIGTERM')
      } catch {
        // Already dead
      }
    }

    // Force kill after 3s
    const timer = setTimeout(() => {
      if (this.process?.pid) {
        try {
          process.kill(this.process.pid, 'SIGKILL')
        } catch {
          // Already dead
        }
      }
    }, 3000)

    this.process.once('exit', () => clearTimeout(timer))
    this.process = null
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (this._status !== 'running') {
      throw new Error(`Cannot call tool: server "${this.name}" is ${this._status}`)
    }
    const timeout = this.config.timeout ?? 30000
    return this.sendRequest('tools/call', { name: toolName, arguments: args }, timeout)
  }
}

// ---------------------------------------------------------------------------
// McpManager (public API)
// ---------------------------------------------------------------------------

export class McpManager {
  private servers = new Map<string, McpServerInstance>()

  /** Add a new MCP server configuration (does not start it). */
  addServer(name: string, config: McpServerConfig): void {
    if (this.servers.has(name)) {
      throw new Error(`MCP server "${name}" already exists.`)
    }
    const instance = new McpServerInstance(name, config)
    instance.on('statusChange', (info: McpServerInfo) => {
      // Status changes are reported via getInfo() — emit for IPC listeners
    })
    this.servers.set(name, instance)
  }

  /** Update an existing server configuration. */
  updateServer(name: string, config: McpServerConfig): void {
    const existing = this.servers.get(name)
    if (!existing) {
      throw new Error(`MCP server "${name}" not found.`)
    }
    // If running, stop first
    if (existing.status === 'running') {
      existing.stop().catch(() => {
        // Ignore stop errors during update
      })
    }
    const newInstance = new McpServerInstance(name, config)
    newInstance.on('statusChange', () => {
      // Status changes are reported via getInfo()
    })
    this.servers.set(name, newInstance)
  }

  /** Start an MCP server by name. */
  async startServer(name: string): Promise<void> {
    const instance = this.servers.get(name)
    if (!instance) {
      throw new Error(`MCP server "${name}" not found.`)
    }
    await instance.start()
  }

  /** Stop an MCP server by name. */
  async stopServer(name: string): Promise<void> {
    const instance = this.servers.get(name)
    if (!instance) {
      throw new Error(`MCP server "${name}" not found.`)
    }
    await instance.stop()
  }

  /** Remove an MCP server (stops it first if running). */
  async removeServer(name: string): Promise<void> {
    const instance = this.servers.get(name)
    if (!instance) return
    if (instance.status === 'running' || instance.status === 'starting') {
      await instance.stop()
    }
    this.servers.delete(name)
  }

  /** List all configured MCP servers with their current status. */
  listServers(): McpServerInfo[] {
    return Array.from(this.servers.values()).map((s) => s.getInfo())
  }

  /** Get the list of tools exposed by a running MCP server. */
  getServerTools(name: string): McpTool[] {
    const instance = this.servers.get(name)
    if (!instance) {
      throw new Error(`MCP server "${name}" not found.`)
    }
    return instance.getTools()
  }

  /** Call a tool on a running MCP server. */
  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const instance = this.servers.get(serverName)
    if (!instance) {
      throw new Error(`MCP server "${serverName}" not found.`)
    }
    return instance.callTool(toolName, args)
  }

  /** Stop all running servers (call during app shutdown). */
  async shutdown(): Promise<void> {
    const promises: Promise<void>[] = []
    for (const instance of this.servers.values()) {
      if (instance.status === 'running' || instance.status === 'starting') {
        promises.push(instance.stop())
      }
    }
    await Promise.allSettled(promises)
  }
}

// Singleton
let _instance: McpManager | null = null
export function getMcpManager(): McpManager {
  if (!_instance) _instance = new McpManager()
  return _instance
}
