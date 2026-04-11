import { ipcMain } from 'electron'
import { tokenOptimizer } from '../services/tokenOptimizer.js'
import { agentMemory } from '../services/agentMemory.js'
import { tokenTracker } from '../services/tokenTracker.js'

export function registerTokensIpc(): void {
  // Token Optimizer
  ipcMain.handle('optimizer:compress', async (_event, { messages, strategy, keepLast, provider, model }: {
    messages: unknown[]; strategy: string; keepLast?: number; provider?: string; model?: string
  }) => {
    if (!Array.isArray(messages)) return messages
    const safeMessages = messages.map(m => {
      if (typeof m === 'object' && m !== null && 'content' in m) return m as any
      return { role: 'user', content: String(m), timestamp: Date.now() }
    })
    if (strategy === 'rolling') return await tokenOptimizer.rollingSummary(safeMessages, keepLast, provider, model)
    if (strategy === 'truncate') return tokenOptimizer.truncateToFit(safeMessages, 50000)
    if (strategy === 'deduplicate') return tokenOptimizer.deduplicateFileAttachments(safeMessages)
    return safeMessages
  })

  ipcMain.handle('optimizer:estimate', (_event, messages: any[]) => {
    const chars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0)
    return { estimatedTokens: Math.ceil(chars / 4), messageCount: messages.length }
  })

  // Memory
  ipcMain.handle('memory:get', () => agentMemory.getAll())
  ipcMain.handle('memory:forget', (_event, key: string) => { agentMemory.forget(key); return { ok: true } })
  ipcMain.handle('memory:list', () => agentMemory.getAll())
  ipcMain.handle('memory:deleteById', (_event, id: string) => { agentMemory.deleteById(id); return { ok: true } })
  ipcMain.handle('memory:update', (_event, { id, value }: { id: string; value: string }) => { agentMemory.update(id, value); return { ok: true } })
  ipcMain.handle('memory:clear', () => { agentMemory.clearAll(); return { ok: true } })
  ipcMain.handle('memory:search', (_event, query: string) => agentMemory.search(query))
  ipcMain.handle('memory:remember', (_event, { key, value, tags }: { key: string; value: string; tags?: string[] }) => {
    agentMemory.remember(key, value, tags || []); return { ok: true }
  })

  // Token Tracker
  ipcMain.handle('tokens:record', (_event, rec: unknown) => {
    if (rec && typeof rec === 'object' && 'sessionId' in rec && 'totalTokens' in rec) {
      tokenTracker.record(rec as any)
    }
    return { ok: true }
  })
  ipcMain.handle('tokens:today', () => tokenTracker.getTotalToday())
  ipcMain.handle('tokens:month', () => tokenTracker.getTotalThisMonth())
  ipcMain.handle('tokens:breakdown', () => tokenTracker.getProviderBreakdown())
  ipcMain.handle('tokens:recent', (_event, limit?: number) => tokenTracker.getRecentSessions(limit))
}
