import { ipcMain } from 'electron'
import { pluginLoader } from '../services/pluginLoader.js'

export function registerPluginsIpc(): void {
  ipcMain.handle('plugins:list', () =>
    pluginLoader.getLoadedPlugins().map(p => ({ name: p.name, version: p.version, toolCount: p.tools.length })))
  ipcMain.handle('plugins:install', async (_event, pluginDir: string) => {
    const path = await import('path')
    const os = await import('os')
    const app = await import('electron')
    const safeDir = path.resolve(pluginDir)
    const home = os.homedir()
    const userData = app.app.getPath('userData')
    if (!safeDir.startsWith(home) && !safeDir.startsWith(userData)) throw new Error('Path traversal denied')
    return pluginLoader.installPlugin(safeDir)
  })
  ipcMain.handle('plugins:unload', (_event, name: string) => { pluginLoader.unloadPlugin(name); return { ok: true } })
  ipcMain.handle('plugins:fetchRegistry', async (_event, url?: string) => pluginLoader.fetchRegistry(url))
  ipcMain.handle('plugins:installFromRegistry', async (_event, entry: any) => pluginLoader.installFromRegistry(entry))
}
