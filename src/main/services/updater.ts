// electron-updater is a CommonJS module — must use default import in ESM context
import electronUpdater from 'electron-updater'
const { autoUpdater } = electronUpdater

import { BrowserWindow, ipcMain, app } from 'electron'

// electron-updater needs release assets (latest.yml / latest-linux.yml) uploaded
// to GitHub Releases. If the release has no assets, the GitHub API returns HTTP 406
// which causes an unhandled error log. Guard by checking if we're in a packaged
// production build AND the release feed is properly set up.
function isUpdateCheckSafe(): boolean {
  // Only run updater in packaged app (not npm run dev)
  if (!app.isPackaged) return false
  // Disable in dev/CI environments
  if (process.env.SINGULARITY_NO_UPDATER === '1') return false
  return true
}

export function setupAutoUpdater(mainWindow: BrowserWindow): void {
  autoUpdater.autoDownload = true
  // Suppress error dialogs — we handle errors ourselves
  autoUpdater.autoInstallOnAppQuit = true
  // Allow downgrade (useful during early releases)
  autoUpdater.allowDowngrade = false

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
    // Silently log — do NOT crash the app for update failures
    // Common causes: no release assets, no internet, HTTP 406 (no assets uploaded yet)
    console.warn('[updater] Update check failed (non-fatal):', err.message)
    mainWindow.webContents.send('updater:error', { message: err.message })
  })

  if (!isUpdateCheckSafe()) {
    console.log('[updater] Skipping update check (dev mode or SINGULARITY_NO_UPDATER=1)')
    ipcMain.handle('updater:install-now', () => {})
    ipcMain.handle('updater:check-now', async () => {})
    return
  }

  // Check for updates after 10 seconds (non-blocking, fully silenced on failure)
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('[updater] Background check failed (non-fatal):', err.message)
    })
  }, 10_000)

  ipcMain.handle('updater:install-now', () => { autoUpdater.quitAndInstall(false, true) })
  ipcMain.handle('updater:check-now', async () => {
    try { await autoUpdater.checkForUpdates() } catch (err) {
      console.warn('[updater] Manual check failed:', err instanceof Error ? err.message : err)
    }
  })
}
