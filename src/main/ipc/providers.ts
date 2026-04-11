import { ipcMain } from 'electron'
import { initProviders, registry } from '../providers/index.js'
import { ollamaProvider } from '../providers/ollama.js'

export function registerProvidersIpc(): void {
  ipcMain.handle('providers:list', async () => {
    try {
      const providers = await registry.getAvailable()
      return await Promise.all(providers.map(async (p) => ({
        id: p.id, name: p.name, models: await p.getModels(),
      })))
    } catch (err) { console.error('providers:list error:', err); return [] }
  })

  // Ollama-specific handlers
  ipcMain.handle('ollama:status', async () => {
    try {
      const available = await ollamaProvider.isAvailable()
      const models = available ? await ollamaProvider.getModels() : []
      return { available, baseUrl: ollamaProvider.getBaseUrl(), models }
    } catch (err) {
      return { available: false, baseUrl: ollamaProvider.getBaseUrl(), models: [], error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('ollama:setBaseUrl', (_event, url: string) => {
    try {
      ollamaProvider.setBaseUrl(url)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('ollama:refreshModels', async () => {
    try {
      const models = await ollamaProvider.refreshModels()
      return { ok: true, models }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), models: [] }
    }
  })

  ipcMain.handle('ollama:pullModel', async (_event, model: string) => {
    try {
      let lastStatus = ''
      await ollamaProvider.pullModel(model, (status) => { lastStatus = status })
      return { ok: true, status: lastStatus }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

export { initProviders, registry, ollamaProvider }
