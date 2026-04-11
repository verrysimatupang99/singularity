import { ipcMain } from 'electron'
import { CliSessionManager, CliError } from '../services/cliSessionManager.js'

let cliManager: CliSessionManager
const cliStreamUnsubs = new Map<string, Set<() => void>>()
let _safeSend: ((channel: string, ...args: unknown[]) => void) | null = null

export function setCliManager(mgr: CliSessionManager): void { cliManager = mgr }
export function setSafeSend(fn: (channel: string, ...args: unknown[]) => void): void { _safeSend = fn }

function safeSend(channel: string, ...args: unknown[]): void {
  if (_safeSend) _safeSend(channel, ...args)
}

export function registerCliIpc(): void {
  ipcMain.handle('cli:detect', async () => {
    try { return await cliManager.detectCliBinaries() }
    catch (err) { console.error('cli:detect error:', err); return {} }
  })

  ipcMain.handle('cli:spawn', async (_event, { cliName, cwd, config }: {
    cliName: string; cwd: string; config?: { env?: Record<string, string>; extraArgs?: string[] }
  }) => {
    try {
      const session = await cliManager.spawn(cliName, cwd, config)
      const sessionId = session.getInfo().sessionId
      const unsubs = new Set<() => void>()

      unsubs.add(session.onStream((chunk) => safeSend('cli:stream', { sessionId, chunk })))
      unsubs.add(session.onPermissionRequest((req) => safeSend('cli:permission', { sessionId, request: req })))
      session.on('exit', () => {
        for (const unsub of unsubs) unsub()
        cliStreamUnsubs.delete(sessionId)
        safeSend('cli:exit', { sessionId })
      })

      cliStreamUnsubs.set(sessionId, unsubs)
      return { sessionId }
    } catch (err) {
      console.error('cli:spawn error:', err)
      if (err instanceof CliError) throw { message: err.message, kind: err.kind }
      throw err
    }
  })

  ipcMain.handle('cli:prompt', (_event, { sessionId, text }: { sessionId: string; text: string }) => {
    try {
      const session = cliManager.getSession(sessionId)
      if (!session) throw new Error(`Session not found: ${sessionId}`)
      session.sendPrompt(text)
      return { ok: true }
    } catch (err) { console.error('cli:prompt error:', err); throw err }
  })

  ipcMain.handle('cli:terminate', async (_event, sessionId: string) => {
    try {
      const unsubs = cliStreamUnsubs.get(sessionId)
      if (unsubs) { for (const unsub of unsubs) unsub(); cliStreamUnsubs.delete(sessionId) }
      await cliManager.terminateSession(sessionId)
      return { ok: true }
    } catch (err) { console.error('cli:terminate error:', err); throw err }
  })

  ipcMain.handle('cli:permission', (_event, { sessionId, requestId, allowed }: {
    sessionId: string; requestId: string; allowed: boolean
  }) => {
    try {
      const session = cliManager.getSession(sessionId)
      if (!session) throw new Error(`Session not found: ${sessionId}`)
      session.grantPermission(requestId, allowed)
      return { ok: true }
    } catch (err) { console.error('cli:permission error:', err); throw err }
  })

  ipcMain.handle('cli:sessions:list', () => {
    try { return cliManager.getSessionsInfo() }
    catch (err) { console.error('cli:sessions:list error:', err); return [] }
  })
}
