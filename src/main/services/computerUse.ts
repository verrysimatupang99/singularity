import { BrowserWindow } from 'electron'

// Lazy-load nut-js — return false if unavailable
let nutLoaded = false
let mouse: any, keyboard: any, Key: any, Button: any

async function loadNut(): Promise<boolean> {
  if (nutLoaded) return true
  try {
    const nut = await import('@nut-tree/nut-js')
    mouse = nut.mouse
    keyboard = nut.keyboard
    Key = nut.Key
    Button = nut.Button
    nutLoaded = true
    return true
  } catch {
    return false
  }
}

export interface ComputerUseAction {
  type: 'screenshot' | 'click' | 'type' | 'scroll' | 'key'
  x?: number; y?: number; text?: string; key?: string; direction?: 'up' | 'down'; amount?: number
}

export interface ComputerUseResult {
  success: boolean
  screenshot?: string
  error?: string
}

export class ComputerUseController {
  async screenshot(): Promise<ComputerUseResult> {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false, error: 'No focused window' }
    try {
      const image = await win.webContents.capturePage()
      return { success: true, screenshot: image.toPNG().toString('base64') }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async click(x: number, y: number): Promise<ComputerUseResult> {
    const ok = await loadNut()
    if (!ok) return { success: false, error: 'nut-js not available — mouse/keyboard control requires @nut-tree/nut-js' }
    try {
      await mouse.setPosition({ x, y })
      await mouse.click(Button.LEFT)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  async type(text: string): Promise<ComputerUseResult> {
    const ok = await loadNut()
    if (!ok) return { success: false, error: 'nut-js not available' }
    try {
      await keyboard.type(text)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  async pressKey(key: string): Promise<ComputerUseResult> {
    const ok = await loadNut()
    if (!ok) return { success: false, error: 'nut-js not available' }
    try {
      const keyMap: Record<string, string> = {
        'Enter': 'Return', 'Escape': 'Escape', 'Tab': 'Tab',
        'Backspace': 'Backspace', 'Delete': 'Delete',
        'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
      }
      const k = Key[keyMap[key] || key]
      if (!k) return { success: false, error: `Unknown key: ${key}` }
      await keyboard.pressKey(k)
      await keyboard.releaseKey(k)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }

  async scroll(x: number, y: number, direction: 'up' | 'down', amount: number = 3): Promise<ComputerUseResult> {
    const ok = await loadNut()
    if (!ok) return { success: false, error: 'nut-js not available' }
    try {
      await mouse.setPosition({ x, y })
      if (direction === 'down') await mouse.scrollDown(amount)
      else await mouse.scrollUp(amount)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  }
}

export const computerUseController = new ComputerUseController()
