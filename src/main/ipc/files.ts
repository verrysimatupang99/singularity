import { ipcMain, app } from 'electron'
import path from 'path'
import os from 'os'
import { applyUnifiedDiff, countDiffLines, parseDiffHunks, generateUnifiedDiff } from '../utils/diff.js'

function validateString(input: unknown, maxLen = 100_000): string {
  if (typeof input !== 'string') throw new Error('Expected string input')
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

export function registerFilesIpc(): void {
  // AI Diff Apply
  ipcMain.handle('ai:applyDiff', async (_event, { filePath, diff }: { filePath: string; diff: string }) => {
    const safePath = sanitizePath(filePath)
    const safeDiff = validateString(diff)
    const { readFileSync, writeFileSync } = await import('fs')
    try {
      const original = readFileSync(safePath, 'utf8')
      const applied = applyUnifiedDiff(original, safeDiff)
      writeFileSync(safePath, applied, 'utf8')
      return { success: true, linesChanged: countDiffLines(safeDiff) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('ai:previewDiff', async (_event, { filePath, diff }: { filePath: string; diff: string }) => {
    const safePath = sanitizePath(filePath)
    const safeDiff = validateString(diff)
    const { readFileSync } = await import('fs')
    try {
      const original = readFileSync(safePath, 'utf8')
      const hunks = parseDiffHunks(safeDiff)
      return { filePath: safePath, hunks, originalLines: original.split('\n').length, totalAdded: hunks.reduce((sum, h) => sum + h.additions, 0), totalRemoved: hunks.reduce((sum, h) => sum + h.deletions, 0), original }
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('ai:generateDiff', async (_event, { filePath, newContent }: { filePath: string; newContent: string }) => {
    const safePath = sanitizePath(filePath)
    const safeContent = validateString(newContent)
    const { readFileSync } = await import('fs')
    try {
      const original = readFileSync(safePath, 'utf8')
      return { success: true, diff: generateUnifiedDiff(safePath, safePath, original, safeContent) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // File Operations
  ipcMain.handle('fs:pickFolder', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'Open Workspace Folder' })
    return result.filePaths[0] || null
  })

  ipcMain.handle('fs:readDir', async (_event, dirPath: string) => {
    const safeDirPath = sanitizePath(dirPath)
    const { readdirSync, statSync } = await import('fs')
    const { join } = await import('path')
    const IGNORED = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', 'coverage', '.nyc_output', '__pycache__', '.DS_Store', 'Thumbs.db'])
    try {
      return readdirSync(safeDirPath).filter((name) => !IGNORED.has(name) && !name.startsWith('.')).map((name) => {
        const fullPath = join(safeDirPath, name)
        const stat = statSync(fullPath)
        return { name, path: fullPath, type: stat.isDirectory() ? 'dir' : 'file' as const, size: stat.isFile() ? stat.size : 0, ext: stat.isFile() ? name.split('.').at(-1) || '' : '' }
      }).sort((a, b) => { if (a.type !== b.type) return a.type === 'dir' ? -1 : 1; return a.name.localeCompare(b.name) })
    } catch { return [] }
  })

  ipcMain.handle('fs:readFile', async (_event, filePath: string) => {
    const safePath = sanitizePath(filePath)
    const { readFileSync, statSync } = await import('fs')
    const stat = statSync(safePath)
    if (stat.size > 2 * 1024 * 1024) throw new Error('File too large for editor (max 2MB)')
    return readFileSync(safePath, 'utf8')
  })

  ipcMain.handle('fs:writeFile', async (_event, { filePath, content }: { filePath: string; content: string }) => {
    const safePath = sanitizePath(filePath)
    const { writeFileSync, mkdirSync } = await import('fs')
    const { dirname } = await import('path')
    mkdirSync(dirname(safePath), { recursive: true })
    writeFileSync(safePath, content, 'utf8')
    return { success: true }
  })

  ipcMain.handle('fs:search', async (_event, { pattern, directory, options }: {
    pattern: string; directory: string; options: { caseSensitive: boolean; useRegex: boolean; filePattern?: string }
  }) => {
    const safePattern = validateString(pattern, 10_000)
    const safeDirectory = sanitizePath(directory)
    const { execFileSync, execSync } = await import('child_process')
    const { existsSync } = await import('fs')
    if (!existsSync(safeDirectory)) return []
    const rgAvailable = (() => { try { execSync('rg --version', { timeout: 1000 }); return true } catch { return false } })()
    const rgArgs = ['--line-number', '--with-filename', '--no-heading', ...(options.caseSensitive ? [] : ['--ignore-case']), ...(options.useRegex ? [] : ['--fixed-strings']), ...(options.filePattern ? ['--glob', options.filePattern] : []), '--glob', '!node_modules', '--glob', '!.git', '--glob', '!dist', '--glob', '!build', '--', safePattern, safeDirectory]
    try {
      const output = rgAvailable ? execFileSync('rg', rgArgs, { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }).toString() : execFileSync('grep', ['-rn', ...(options.caseSensitive ? [] : ['-i']), ...(options.useRegex ? [] : ['-F']), '--', safePattern, safeDirectory], { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }).toString()
      return output.trim().split('\n').filter(Boolean).map((line) => { const parts = line.split(':'); return { file: parts[0]?.trim() || '', line: parseInt(parts[1] || '0'), content: parts.slice(2).join(':').trim() } }).slice(0, 500)
    } catch { return [] }
  })

  // File picker
  ipcMain.handle('file:pick', async () => {
    const { dialog } = await import('electron')
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'All Supported', extensions: ['jpg','jpeg','png','gif','webp','txt','md','ts','tsx','js','py','json','html','css'] },
        { name: 'Images', extensions: ['jpg','jpeg','png','gif','webp'] },
        { name: 'Text Files', extensions: ['txt','md','ts','tsx','js','py','json','html','css'] },
      ],
    })
    return result.filePaths
  })

  ipcMain.handle('file:read', async (_event, filePath: string) => {
    const safePath = sanitizePath(filePath)
    const { readFileSync, statSync } = await import('fs')
    const { extname } = await import('path')
    const stat = statSync(safePath)
    if (stat.size > 10 * 1024 * 1024) throw new Error('File too large (max 10MB)')
    const ext = extname(safePath).toLowerCase()
    const mimeMap: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.ts': 'text/typescript', '.tsx': 'text/typescript', '.js': 'text/javascript', '.py': 'text/x-python', '.json': 'application/json', '.html': 'text/html', '.css': 'text/css' }
    const mimeType = mimeMap[ext] || 'application/octet-stream'
    const isText = mimeType.startsWith('text/') || mimeType === 'application/json'
    const name = safePath.split('/').at(-1) || 'unknown'
    if (isText) return { type: 'text', content: readFileSync(safePath, 'utf8'), mimeType, name, size: stat.size }
    else return { type: 'image', content: readFileSync(safePath).toString('base64'), mimeType, name, size: stat.size }
  })
}
