/**
 * Stitch MCP Server Integration
 * Connects Singularity to Google Stitch via the stitch-mcp proxy
 * Enables design-to-code workflow: pull screens → generate React components
 */

import { spawn, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'

export interface StitchConfig {
  apiKey: string
  projectId: string
}

export interface StitchScreen {
  id: string
  name: string
  description: string
  thumbnail?: string
  html?: string
  css?: string
  reactCode?: string
  tailwindCode?: string
}

export interface StitchMcpServer extends EventEmitter {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  error?: string
}

const STITCH_MCP_COMMAND = 'npx'
const STITCH_MCP_ARGS = ['-y', '@_davideast/stitch-mcp', 'proxy']

class StitchMcpServerImpl extends EventEmitter implements StitchMcpServer {
  status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected'
  error?: string
  private process: ChildProcess | null = null
  private config: StitchConfig | null = null
  private messageId = 0

  async connect(config: StitchConfig): Promise<void> {
    if (this.status === 'connected') return

    this.config = config
    this.status = 'connecting'
    this.emit('statusChange', this.status)

    try {
      this.process = spawn(STITCH_MCP_COMMAND, STITCH_MCP_ARGS, {
        env: {
          ...process.env,
          STITCH_API_KEY: config.apiKey,
          GOOGLE_CLOUD_PROJECT: config.projectId,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      this.process.stdout?.on('data', (data) => {
        this.handleMessage(data.toString())
      })

      this.process.stderr?.on('data', (data) => {
        const msg = data.toString()
        if (msg.includes('error') || msg.includes('Error')) {
          this.status = 'error'
          this.error = msg.trim()
          this.emit('statusChange', this.status)
          this.emit('error', msg)
        }
      })

      this.process.on('exit', (code) => {
        this.status = 'disconnected'
        this.emit('statusChange', this.status)
        if (code !== 0 && code !== null) {
          this.error = `Process exited with code ${code}`
        }
      })

      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout after 10s'))
        }, 10000)

        const onStatus = (status: string) => {
          if (status === 'connected') {
            clearTimeout(timeout)
            this.removeListener('statusChange', onStatus)
            resolve()
          }
        }
        this.on('statusChange', onStatus)
      })

      this.status = 'connected'
      this.emit('statusChange', this.status)
    } catch (err) {
      this.status = 'error'
      this.error = err instanceof Error ? err.message : String(err)
      this.emit('statusChange', this.status)
      throw err
    }
  }

  disconnect(): void {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = null
    }
    this.status = 'disconnected'
    this.emit('statusChange', this.status)
  }

  async listScreens(): Promise<StitchScreen[]> {
    return this.sendRequest('stitch/list_screens', {})
  }

  async getScreen(screenId: string): Promise<StitchScreen> {
    return this.sendRequest('stitch/get_screen', { screen_id: screenId })
  }

  async exportToReact(screenId: string): Promise<{ code: string }> {
    return this.sendRequest('stitch/export_react', { screen_id: screenId })
  }

  async exportToTailwind(screenId: string): Promise<{ html: string; css: string }> {
    return this.sendRequest('stitch/export_tailwind', { screen_id: screenId })
  }

  private handleMessage(data: string): void {
    const lines = data.trim().split('\n')
    for (const line of lines) {
      try {
        const msg = JSON.parse(line)
        if (msg.status) {
          this.status = msg.status
          this.emit('statusChange', msg.status)
        }
        if (msg.id && this.pendingRequests.has(msg.id)) {
          const { resolve, reject } = this.pendingRequests.get(msg.id)!
          this.pendingRequests.delete(msg.id)
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)))
          } else {
            resolve(msg.result)
          }
        }
      } catch {
        // Not JSON, ignore
      }
    }
  }

  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
  }>()

  private sendRequest<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.process || this.status !== 'connected') {
      throw new Error(`Stitch MCP not connected (status: ${this.status})`)
    }

    const id = ++this.messageId
    const request = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params,
    }) + '\n'

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.process?.stdin?.write(request)

      // Timeout after 30s
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`Request timeout: ${method}`))
        }
      }, 30000)
    })
  }
}

// Singleton
let _instance: StitchMcpServerImpl | null = null

export function getStitchMcpServer(): StitchMcpServerImpl {
  if (!_instance) {
    _instance = new StitchMcpServerImpl()
  }
  return _instance
}
