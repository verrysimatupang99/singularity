import { ipcMain } from 'electron'
import { McpManager } from '../services/mcpManager.js'

let mcpManager: McpManager

export function setMcpManager(mgr: McpManager): void { mcpManager = mgr }

export function registerMcpIpc(): void {
  ipcMain.handle('mcp:list', () => {
    try { return mcpManager.listServers() }
    catch (err) { console.error('mcp:list error:', err); return [] }
  })

  ipcMain.handle('mcp:start', async (_event, name: string) => {
    try {
      await mcpManager.startServer(name)
      return mcpManager.listServers().find((s) => s.name === name)
    } catch (err) { console.error('mcp:start error:', err); throw err }
  })

  ipcMain.handle('mcp:stop', async (_event, name: string) => {
    try {
      await mcpManager.stopServer(name)
      return mcpManager.listServers().find((s) => s.name === name)
    } catch (err) { console.error('mcp:stop error:', err); throw err }
  })

  ipcMain.handle('mcp:add', (_event, { name, config }: {
    name: string; config: { command: string; args: string[]; env?: Record<string, string>; cwd?: string; timeout?: number }
  }) => {
    try {
      mcpManager.addServer(name, config)
      return mcpManager.listServers().find((s) => s.name === name)
    } catch (err) { console.error('mcp:add error:', err); throw err }
  })

  ipcMain.handle('mcp:remove', async (_event, name: string) => {
    try { await mcpManager.removeServer(name); return { ok: true } }
    catch (err) { console.error('mcp:remove error:', err); throw err }
  })

  ipcMain.handle('mcp:tools', (_event, name: string) => {
    try { return mcpManager.getServerTools(name) }
    catch (err) { console.error('mcp:tools error:', err); throw err }
  })

  ipcMain.handle('mcp:callTool', async (_event, { serverName, toolName, args }: {
    serverName: string; toolName: string; args: Record<string, unknown>
  }) => {
    try { return await mcpManager.callTool(serverName, toolName, args) }
    catch (err) { console.error('mcp:callTool error:', err); throw err }
  })
}
