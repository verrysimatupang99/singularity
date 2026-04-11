import { ipcMain } from 'electron'
import { getStitchMcpServer } from '../services/stitchMcp.js'

const stitchServer = getStitchMcpServer()

export function registerStitchIpc(): void {
  ipcMain.handle('stitch:connect', async (_event, config: { apiKey: string; projectId: string }) => {
    try { await stitchServer.connect(config); return { success: true } }
    catch (err: any) { return { success: false, error: err.message } }
  })
  ipcMain.handle('stitch:disconnect', () => { stitchServer.disconnect(); return { success: true } })
  ipcMain.handle('stitch:status', () => ({ status: stitchServer.status, error: stitchServer.error }))
  ipcMain.handle('stitch:listScreens', async () => {
    try { return await stitchServer.listScreens() } catch (err: any) { return { error: err.message } }
  })
  ipcMain.handle('stitch:getScreen', async (_event, screenId: string) => {
    try { return await stitchServer.getScreen(screenId) } catch (err: any) { return { error: err.message } }
  })
  ipcMain.handle('stitch:exportReact', async (_event, screenId: string) => {
    try { return await stitchServer.exportToReact(screenId) } catch (err: any) { return { error: err.message } }
  })
  ipcMain.handle('stitch:exportTailwind', async (_event, screenId: string) => {
    try { return await stitchServer.exportToTailwind(screenId) } catch (err: any) { return { error: err.message } }
  })
}
