// electron-updater is a CommonJS module — must use default import in ESM context
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater

import { BrowserWindow, ipcMain } from 'electron'

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = true

  autoUpdater.on('update-available', () => {
    mainWindow.webContents.send('updater:update-available', true)
  })
  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('updater:update-downloaded', true)
  })
  autoUpdater.on('download-progress', (p) => {
    mainWindow.webContents.send('updater:download-progress', { percent: p.percent })
  })
  autoUpdater.on('error', (err) => {
    console.error('Updater error:', err.message)
    mainWindow.webContents.send('updater:error', { message: err.message })
  })

  // Check for updates after 5 seconds (non-blocking)
  setTimeout(() => { autoUpdater.checkForUpdatesAndNotify().catch(() => {}) }, 5000)

  ipcMain.handle('updater:install-now', () => { autoUpdater.quitAndInstall(false, true) })
  ipcMain.handle('updater:check-now', async () => {
    try { await autoUpdater.checkForUpdates() } catch {}
  })
}
