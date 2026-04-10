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
}

export const pluginLoader = new PluginLoader()
