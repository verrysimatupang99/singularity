import { ipcMain } from 'electron'
import { isSecureMode } from '../services/storage.js'

export function registerSecurityIpc(): void {
  ipcMain.handle('security:isSecureMode', () => isSecureMode())
}
