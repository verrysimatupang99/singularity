export interface ComputerUseAction {
  type: 'screenshot' | 'click' | 'type' | 'scroll' | 'key'
  x?: number; y?: number; text?: string; key?: string; direction?: 'up' | 'down'; amount?: number
}

export interface ComputerUseResult {
  success: boolean
  screenshot?: string  // base64 PNG
  error?: string
}

export class ComputerUseController {
  async screenshot(): Promise<ComputerUseResult> {
    const { BrowserWindow } = await import('electron')
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: 'No focused window' }
    try {
      const image = await win.webContents.capturePage()
      return { success: true, screenshot: image.toPNG().toString('base64') }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async click(_x: number, _y: number): Promise<ComputerUseResult> {
    return { success: false, error: "Computer use click: not implemented in Phase 7 (planned Phase 8)" }
  }

  async type(_text: string): Promise<ComputerUseResult> {
    return { success: false, error: "Computer use type: not implemented in Phase 7 (planned Phase 8)" }
  }
}

export const computerUseController = new ComputerUseController()
