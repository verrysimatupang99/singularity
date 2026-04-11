import { app, BrowserWindow, ipcMain, session } from 'electron'
import path, { join } from 'path'
import { McpManager } from './services/mcpManager.js'
import { CliSessionManager } from './services/cliSessionManager.js'
import { crashReporter } from './services/crashReporter.js'
import { pluginLoader } from './services/pluginLoader.js'
import { setupAutoUpdater } from './services/updater.js'
import { registerAllIpc, setCliManager, setMcpManager, getTerminals } from './ipc/index.js'

// Fix GPU / sandbox issues (Linux needs these most)
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-dev-shm-usage')
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-sandbox')
  app.disableHardwareAcceleration()
}

let mainWindow: BrowserWindow | null = null
let _mcpManager: McpManager | null = null

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPreloadPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'app.asar', 'dist', 'preload', 'index.cjs')
    : join(process.cwd(), 'dist', 'preload', 'index.cjs')
}

function safeSend(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try { mainWindow.webContents.send(channel, ...args) } catch {}
  }
}

function createWindow(): void {
  const preloadPath = getPreloadPath()

  mainWindow = new BrowserWindow({
    width: 1400, height: 900, title: 'Singularity',
    webPreferences: { preload: preloadPath, contextIsolation: true, nodeIntegration: false },
    show: false,
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, desc) => {
    console.error('[main] Renderer failed to load:', code, desc)
  })
  mainWindow.webContents.on('did-finish-load', () => console.log('[main] Renderer loaded successfully'))
  mainWindow.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.log(`[renderer] ${message}`)
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    console.log('[main] Loading from dev server:', process.env.VITE_DEV_SERVER_URL)
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    const indexPath = app.isPackaged
      ? join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'index.html')
      : join(process.cwd(), 'dist', 'renderer', 'index.html')
    mainWindow.loadFile(indexPath)
  }

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
}

// ---------------------------------------------------------------------------
// Ping (basic test)
// ---------------------------------------------------------------------------
ipcMain.handle('ping', () => 'pong')

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  // --- Content Security Policy ---
  const isDev = !app.isPackaged
  const scriptSrc = isDev ? "'self' 'unsafe-eval' 'unsafe-inline'" : "'self'"
  const styleSrc = isDev ? "'self' 'unsafe-inline' https://fonts.googleapis.com" : "'self' 'unsafe-inline' https://fonts.googleapis.com"
  const fontSrc = isDev ? "'self' data: https://fonts.gstatic.com" : "'self' data: https://fonts.gstatic.com"
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self'; script-src ${scriptSrc}; style-src ${styleSrc}; font-src ${fontSrc}; img-src 'self' data: blob: https:; connect-src 'self' https: wss:; worker-src 'self' blob:`
        ]
      }
    })
  })

  // --- Renderer crash logging ---
  ipcMain.on('log:renderer-error', (_event, data: { message: string; stack?: string }) => {
    console.error('[renderer-crash]', data.message)
    if (data.stack) console.error(data.stack)
  })

  // --- Register all IPC handlers ---
  const preloadPath = getPreloadPath()
  registerAllIpc(safeSend, preloadPath)

  // --- Initialize services ---
  const cliManager = new CliSessionManager()
  _mcpManager = new McpManager()
  setCliManager(cliManager)
  setMcpManager(_mcpManager)

  const { initProviders } = await import('./ipc/index.js')
  initProviders({})

  // Load plugins on startup
  try { await pluginLoader.loadFromDir(pluginLoader['pluginDir']) } catch {}

  createWindow()
  if (mainWindow) setupAutoUpdater(mainWindow)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

// Graceful shutdown: stop all terminals + MCP servers
app.on('before-quit', async () => {
  for (const [, term] of getTerminals()) { try { term.kill() } catch {} }
  if (_mcpManager) {
    try { await _mcpManager.shutdown() } catch (err) { console.error('MCP shutdown error:', err) }
  }
})
