import { ipcMain, BrowserWindow, app } from 'electron'
import path from 'path'

function createSecondaryWindow(options: { route?: string; width?: number; height?: number } = {}): BrowserWindow {
  const preloadPath = (globalThis as any)._preloadPath
  const win = new BrowserWindow({
    width: options.width || 1200, height: options.height || 800,
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
  })
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    const indexPath = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'index.html')
      : path.join(process.cwd(), 'dist', 'renderer', 'index.html')
    win.loadFile(indexPath)
  }
  return win
}

export function registerWindowIpc(): void {
  ipcMain.handle('window:open-new', async (_event, options: { route?: string; width?: number; height?: number }) => {
    const win = createSecondaryWindow(options)
    return { windowId: win.id }
  })

  ipcMain.handle('window:close-current', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
    return { ok: true }
  })

  ipcMain.handle('window:set-title', async (event, title: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.setTitle(title)
    return { ok: true }
  })

  ipcMain.handle('window:list', () =>
    BrowserWindow.getAllWindows().map(w => ({ id: w.id, title: w.getTitle() })))
}
