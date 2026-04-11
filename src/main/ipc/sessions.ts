import { ipcMain } from 'electron'
import { writeFileSync } from 'fs'
import {
  listSessions,
  createSession,
  deleteSession,
  loadSession,
  saveSession,
} from '../services/storage.js'

export function registerSessionIpc(): void {
  ipcMain.handle('sessions:list', () => {
    try { return listSessions() }
    catch (err) { console.error('sessions:list error:', err); return [] }
  })

  ipcMain.handle('sessions:create', (_event, data: { name?: string; provider: string; model: string }) => {
    try { return createSession(data) }
    catch (err) { console.error('sessions:create error:', err); throw err }
  })

  ipcMain.handle('sessions:delete', (_event, id: string) => {
    try { deleteSession(id) }
    catch (err) { console.error('sessions:delete error:', err); throw err }
  })

  ipcMain.handle('sessions:load', (_event, id: string) => {
    try { return loadSession(id) }
    catch (err) { console.error('sessions:load error:', err); throw err }
  })

  ipcMain.handle('sessions:save', (_event, { id, messages }: { id: string; messages: unknown[] }) => {
    try { saveSession(id, messages as Parameters<typeof saveSession>[1]) }
    catch (err) { console.error('sessions:save error:', err); throw err }
  })

  // Session Export
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
        ``, `---`, ``,
      ]
      for (const msg of messages) {
        const role = msg.role === 'user' ? '**You**' : '**Assistant**'
        const time = new Date(msg.timestamp).toLocaleTimeString()
        lines.push(`### ${role} · ${time}`, ``, msg.content)
        if ((msg as any).tokenUsage?.totalTokens) {
          lines.push(``, `*${(msg as any).tokenUsage.totalTokens.toLocaleString()} tokens*`)
        }
        lines.push(``, `---`, ``)
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
}
