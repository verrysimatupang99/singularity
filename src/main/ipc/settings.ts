import { ipcMain } from 'electron'
import {
  getSettings, setSettings, getAuthStatus, setApiKey, deleteApiKey, getApiKey,
} from '../services/storage.js'

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => {
    try {
      const settings = getSettings()
      const maskedKeys: Record<string, string> = {}
      for (const [provider, encrypted] of Object.entries(settings.apiKeys)) {
        if (encrypted.length > 0) maskedKeys[provider] = 'sk-...' + encrypted.slice(-4)
      }
      return { ...settings, apiKeys: maskedKeys }
    } catch (err) { console.error('settings:get error:', err); throw err }
  })

  ipcMain.handle('settings:set', (_event, updates: Record<string, unknown>) => {
    try { setSettings(updates as Parameters<typeof setSettings>[0]) }
    catch (err) { console.error('settings:set error:', err); throw err }
  })
}

export function registerAuthIpc(): void {
  ipcMain.handle('auth:status', () => {
    try { return getAuthStatus() }
    catch (err) { console.error('auth:status error:', err); throw err }
  })

  ipcMain.handle('auth:setKey', (_event, { provider, key }: { provider: string; key: string }) => {
    try { return setApiKey(provider, key) }
    catch (err) { console.error('auth:setKey error:', err); throw err }
  })

  ipcMain.handle('auth:deleteKey', (_event, provider: string) => {
    try { deleteApiKey(provider) }
    catch (err) { console.error('auth:deleteKey error:', err); throw err }
  })

  // Re-export getApiKey for chat module
  ;(globalThis as any)._getApiKey = getApiKey
}

export { getApiKey }
