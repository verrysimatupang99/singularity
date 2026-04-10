import { vi } from 'vitest'

const fakeEncrypted = 'fake-encrypted-buffer'
const fakeDecrypted = 'fake-decrypted-value'

export const safeStorage = {
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((val: string) => Buffer.from(fakeEncrypted + ':' + val)),
  decryptString: vi.fn((buf: Buffer) => {
    const str = buf.toString()
    if (str.startsWith(fakeEncrypted + ':')) {
      return str.slice(fakeEncrypted.length + 1)
    }
    return fakeDecrypted
  }),
}

export const app = {
  getPath: vi.fn((name: string) => `/tmp/singularity-test-${name}`),
  isPackaged: false,
  whenReady: vi.fn(() => Promise.resolve()),
  on: vi.fn(),
  quit: vi.fn(),
  commandLine: {
    appendSwitch: vi.fn(),
  },
  disableHardwareAcceleration: vi.fn(),
}

export const ipcMain = {
  handle: vi.fn(),
  on: vi.fn(),
}

export class MockBrowserWindow {
  static instance: MockBrowserWindow | null = null

  webContents = {
    openDevTools: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
  }

  loadURL = vi.fn()
  loadFile = vi.fn()
  on = vi.fn()
  close = vi.fn()
  isDestroyed = vi.fn(() => false)

  constructor() {
    MockBrowserWindow.instance = this
  }
}

export const BrowserWindow = vi.fn(() => MockBrowserWindow.instance ?? new MockBrowserWindow()) as unknown as typeof MockBrowserWindow & {
  new (): MockBrowserWindow
  getAllWindows: () => MockBrowserWindow[]
}

BrowserWindow.getAllWindows = vi.fn(() => {
  return MockBrowserWindow.instance ? [MockBrowserWindow.instance] : []
})

export const session = {
  defaultSession: {
    setProxy: vi.fn(),
  },
}

export const dialog = {
  showOpenDialog: vi.fn(),
  showSaveDialog: vi.fn(),
  showErrorBox: vi.fn(),
  showMessageBox: vi.fn(),
}

export const Menu = {
  buildFromTemplate: vi.fn(),
  setApplicationMenu: vi.fn(),
}

export const MenuItem = vi.fn()

export const shell = {
  openExternal: vi.fn(),
}

export default {
  safeStorage,
  app,
  ipcMain,
  BrowserWindow,
  session,
  dialog,
  Menu,
  MenuItem,
  shell,
}
