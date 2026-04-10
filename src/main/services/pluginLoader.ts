import { createHash } from 'crypto'
import { readFileSync, readdirSync, existsSync, mkdirSync, cpSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AgentTool } from '../providers/types.js'

export interface LoadedPlugin {
  name: string
  version: string
  description: string
  tools: AgentTool[]
  execute: (toolName: string, args: Record<string, unknown>) => Promise<{ output: string; error?: string }>
}

export interface PluginToolDef {
  name: string
  description: string
  parameters: Record<string, unknown>
  requiresApproval: boolean
  handler: string
  handlerExport: string
}

export interface PluginManifest {
  name: string
  version: string
  description: string
  tools: PluginToolDef[]
  env?: string[]
}

export interface PluginRegistryEntry {
  name: string
  displayName: string
  version: string
  description: string
  author: string
  downloadUrl: string
  sha256: string
  tools: string[]
  homepage: string
}

const PLUGIN_REGISTRY_URL = 'https://raw.githubusercontent.com/verrysimatupang99/singularity-plugins/main/registry.json'

export class PluginLoader {
  private plugins: Map<string, LoadedPlugin> = new Map()
  private pluginDir: string
  private registeredTools: Map<string, AgentTool> = new Map()
  private handlers: Map<string, (args: Record<string, unknown>) => Promise<{ output: string; error?: string }>> = new Map()

  constructor() {
    this.pluginDir = join(homedir(), '.config', 'singularity', 'plugins')
    try { mkdirSync(this.pluginDir, { recursive: true }) } catch {}
  }

  async loadFromDir(dir: string): Promise<LoadedPlugin[]> {
    if (!existsSync(dir)) return []
    const loaded: LoadedPlugin[] = []

    for (const entry of readdirSync(dir)) {
      const manifestPath = join(dir, entry, 'singularity-plugin.json')
      if (!existsSync(manifestPath)) continue

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest
        if (!manifest.name || !manifest.tools || !Array.isArray(manifest.tools)) continue

        const tools: AgentTool[] = manifest.tools.map(t => ({
          name: `${manifest.name}_${t.name}`,
          description: t.description,
          parameters: t.parameters,
          requiresApproval: t.requiresApproval,
        }))

        // Load handler modules
        const handlerMap = new Map<string, (args: Record<string, unknown>) => Promise<{ output: string; error?: string }>>()
        for (const toolDef of manifest.tools) {
          const handlerPath = join(dir, entry, toolDef.handler)
          if (existsSync(handlerPath)) {
            const mod = await import(handlerPath)
            const fn = mod[toolDef.handlerExport]
            if (typeof fn === 'function') {
              const prefixedName = `${manifest.name}_${toolDef.name}`
              handlerMap.set(prefixedName, fn)
              this.handlers.set(prefixedName, fn)
            }
          }
        }

        const plugin: LoadedPlugin = {
          name: manifest.name,
          version: manifest.version,
          description: manifest.description || '',
          tools,
          execute: async (toolName, args) => {
            const handler = handlerMap.get(toolName)
            if (handler) return handler(args)
            return { output: '', error: `Handler not found: ${toolName}` }
          },
        }

        this.plugins.set(manifest.name, plugin)
        tools.forEach(t => this.registeredTools.set(t.name, t))
        loaded.push(plugin)
      } catch (err) {
        console.error(`Failed to load plugin ${entry}:`, err)
      }
    }

    return loaded
  }

  async installPlugin(sourceDir: string): Promise<{ success: boolean; name?: string; error?: string }> {
    try {
      const manifestPath = join(sourceDir, 'singularity-plugin.json')
      if (!existsSync(manifestPath)) return { success: false, error: 'singularity-plugin.json not found' }

      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as PluginManifest
      if (!manifest.name) return { success: false, error: 'Missing name in manifest' }

      const destDir = join(this.pluginDir, manifest.name)
      try { mkdirSync(destDir, { recursive: true }); cpSync(sourceDir, destDir, { recursive: true }) } catch {}

      await this.loadFromDir(this.pluginDir)
      return { success: true, name: manifest.name }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  unloadPlugin(name: string): void {
    const plugin = this.plugins.get(name)
    if (plugin) {
      plugin.tools.forEach(t => this.registeredTools.delete(t.name))
      plugin.tools.forEach(t => this.handlers.delete(t.name))
      this.plugins.delete(name)
    }
  }

  getLoadedPlugins(): LoadedPlugin[] { return Array.from(this.plugins.values()) }
  getRegisteredTools(): Map<string, AgentTool> { return this.registeredTools }
  getHandler(name: string) { return this.handlers.get(name) }

  async fetchRegistry(registryUrl?: string): Promise<PluginRegistryEntry[]> {
    const url = registryUrl || PLUGIN_REGISTRY_URL
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (!resp.ok) throw new Error(`Registry fetch failed: ${resp.status}`)
      const data = await resp.json() as { plugins: PluginRegistryEntry[] }
      return data.plugins || []
    } catch (err: any) {
      throw new Error(`Cannot fetch plugin registry: ${err.message}`)
    }
  }

  async installFromRegistry(entry: PluginRegistryEntry): Promise<{ success: boolean; error?: string }> {
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const { writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } = await import('fs')

    try {
      // Download
      const resp = await fetch(entry.downloadUrl, { signal: AbortSignal.timeout(30000) })
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
      const buffer = Buffer.from(await resp.arrayBuffer())

      // Verify SHA-256
      const hash = createHash('sha256').update(buffer).digest('hex')
      if (hash !== entry.sha256) throw new Error(`SHA-256 mismatch: expected ${entry.sha256.slice(0, 16)}..., got ${hash.slice(0, 16)}...`)

      // Extract ZIP
      const tempDir = join(tmpdir(), `singularity-plugin-${Date.now()}`)
      mkdirSync(tempDir, { recursive: true })
      const zipPath = join(tempDir, 'plugin.zip')
      writeFileSync(zipPath, buffer)

      const { default: extract } = await import('extract-zip')
      await extract(zipPath, { dir: tempDir })

      // Find extracted directory (may have version suffix)
      const extractedContents = readdirSync(tempDir).filter(n => n !== 'plugin.zip')
      const extractedDir = extractedContents.length === 1 ? join(tempDir, extractedContents[0]) : tempDir

      // Install
      const result = await this.installPlugin(extractedDir)

      // Cleanup
      try { rmSync(tempDir, { recursive: true, force: true }) } catch {}

      return result
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }
}

export const pluginLoader = new PluginLoader()
