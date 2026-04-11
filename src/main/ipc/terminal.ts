import { ipcMain, app } from 'electron'
import pty from 'node-pty'
import path from 'path'
import os from 'os'

const terminals = new Map<string, pty.IPty>()

let _safeSend: ((channel: string, ...args: unknown[]) => void) | null = null
export function setSafeSend(fn: (channel: string, ...args: unknown[]) => void): void { _safeSend = fn }
function safeSend(channel: string, ...args: unknown[]): void { if (_safeSend) _safeSend(channel, ...args) }

function validateString(input: unknown, maxLen = 256): string {
  if (typeof input !== 'string') throw new Error('Expected string')
  if (input.length > maxLen) throw new Error(`Input too long (max ${maxLen})`)
  return input
}

function sanitizePath(input: unknown): string {
  const p = validateString(input, 4096)
  const resolved = path.resolve(p)
  const home = os.homedir()
  const userData = app.getPath('userData')
  if (!resolved.startsWith(home) && !resolved.startsWith(userData)) throw new Error('Path traversal denied')
  return resolved
}

const ALLOWED_SHELLS = ['bash', 'sh', 'zsh', 'fish', 'cmd.exe', 'powershell.exe', 'pwsh']
function validateShell(input: unknown): string {
  const s = validateString(input, 256)
  const base = path.basename(s)
  if (!ALLOWED_SHELLS.includes(base)) throw new Error(`Shell not allowed: ${base}`)
  return s
}

export function registerTerminalIpc(): void {
  ipcMain.handle('terminal:create', (_event, { cwd, shell: shellArg }: { cwd: string; shell?: string }) => {
    const safeCwd = sanitizePath(cwd)
    const termId = `term_${Date.now()}`
    const defaultShell = process.platform === 'win32' ? process.env.COMSPEC || 'cmd.exe' : process.env.SHELL || '/bin/bash'
    const resolvedShell = shellArg ? validateShell(shellArg) : defaultShell
    const args = process.platform === 'win32' ? [] : ['--login']

    const term = pty.spawn(resolvedShell, args, {
      name: 'xterm-256color', cwd: safeCwd || process.cwd(),
      env: process.env as Record<string, string>, cols: 80, rows: 24,
    })

    term.onData((data) => safeSend('terminal:data', { termId, data }))
    term.onExit(({ exitCode }) => { terminals.delete(termId); safeSend('terminal:exit', { termId, exitCode }) })
    terminals.set(termId, term)
    return { termId }
  })

  ipcMain.handle('terminal:write', (_event, { termId, data }: { termId: string; data: string }) => {
    const term = terminals.get(termId)
    if (term) { term.write(data); return { ok: true } }
    return { ok: false, error: 'Terminal not found' }
  })

  ipcMain.handle('terminal:resize', (_event, { termId, cols, rows }: { termId: string; cols: number; rows: number }) => {
    const term = terminals.get(termId)
    if (term) { term.resize(cols, rows); return { ok: true } }
    return { ok: false }
  })

  ipcMain.handle('terminal:kill', (_event, termId: string) => {
    const term = terminals.get(termId)
    if (term) { term.kill(); terminals.delete(termId) }
    return { ok: true }
  })
}

export function getTerminals(): Map<string, pty.IPty> { return terminals }
