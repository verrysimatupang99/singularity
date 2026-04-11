import { ipcMain } from 'electron'
import { isFirstRun, markOnboardingComplete } from '../services/storage.js'

export function registerOnboardingIpc(): void {
  ipcMain.handle('storage:markOnboardingComplete', () => { markOnboardingComplete(); return { ok: true } })
  ipcMain.handle('storage:isFirstRun', () => isFirstRun())
}
