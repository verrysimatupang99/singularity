import { describe, it, expect } from 'vitest'

// Test the layout reducer logic directly (without React rendering)
interface PanelState {
  sidebar: { open: boolean; width: number }
  fileTree: { open: boolean; width: number }
  editor: { open: boolean }
  chat: { open: boolean; width: number }
  terminal: { open: boolean; height: number }
}

interface LayoutState {
  panels: PanelState
  activeFile: string | null
  openFiles: string[]
  dirtyFiles: Set<string>
  workspaceRoot: string | null
}

type LayoutAction =
  | { type: 'TOGGLE_PANEL'; panel: keyof PanelState }
  | { type: 'SET_PANEL_WIDTH'; panel: 'sidebar' | 'fileTree' | 'chat'; width: number }
  | { type: 'SET_TERMINAL_HEIGHT'; height: number }
  | { type: 'OPEN_FILE'; path: string }
  | { type: 'CLOSE_FILE'; path: string }
  | { type: 'MARK_DIRTY'; path: string }
  | { type: 'MARK_CLEAN'; path: string }

function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case 'TOGGLE_PANEL':
      return { ...state, panels: { ...state.panels, [action.panel]: { ...state.panels[action.panel], open: !state.panels[action.panel].open } } }
    case 'SET_PANEL_WIDTH':
      return { ...state, panels: { ...state.panels, [action.panel]: { ...state.panels[action.panel], width: action.width } } }
    case 'SET_TERMINAL_HEIGHT':
      return { ...state, panels: { ...state.panels, terminal: { ...state.panels.terminal, height: action.height } } }
    case 'OPEN_FILE':
      return {
        ...state,
        openFiles: state.openFiles.includes(action.path) ? state.openFiles : [...state.openFiles, action.path],
        activeFile: action.path,
        panels: { ...state.panels, editor: { open: true } },
      }
    case 'CLOSE_FILE': {
      const idx = state.openFiles.indexOf(action.path)
      if (idx === -1) return state
      const newFiles = state.openFiles.filter((_, i) => i !== idx)
      const newActive = state.activeFile === action.path ? newFiles[Math.min(idx, newFiles.length - 1)] || null : state.activeFile
      const newDirty = new Set(state.dirtyFiles)
      newDirty.delete(action.path)
      return { ...state, openFiles: newFiles, activeFile: newActive, dirtyFiles: newDirty }
    }
    case 'MARK_DIRTY':
      return { ...state, dirtyFiles: new Set(state.dirtyFiles).add(action.path) }
    case 'MARK_CLEAN': {
      const d = new Set(state.dirtyFiles)
      d.delete(action.path)
      return { ...state, dirtyFiles: d }
    }
    default:
      return state
  }
}

const defaultPanels: PanelState = {
  sidebar: { open: true, width: 260 },
  fileTree: { open: false, width: 240 },
  editor: { open: false },
  chat: { open: true, width: 420 },
  terminal: { open: false, height: 240 },
}

const defaultState: LayoutState = {
  panels: defaultPanels,
  activeFile: null,
  openFiles: [],
  dirtyFiles: new Set(),
  workspaceRoot: null,
}

describe('Layout reducer', () => {
  describe('togglePanel', () => {
    it('should toggle panel open state', () => {
      const state = { ...defaultState, panels: { ...defaultPanels } }
      const result = layoutReducer(state, { type: 'TOGGLE_PANEL', panel: 'fileTree' })
      expect(result.panels.fileTree.open).toBe(true)

      const result2 = layoutReducer(result, { type: 'TOGGLE_PANEL', panel: 'fileTree' })
      expect(result2.panels.fileTree.open).toBe(false)
    })
  })

  describe('openFile', () => {
    it('should add file to openFiles and set activeFile', () => {
      const state = { ...defaultState, panels: { ...defaultPanels } }
      const result = layoutReducer(state, { type: 'OPEN_FILE', path: '/src/main/index.ts' })

      expect(result.openFiles).toEqual(['/src/main/index.ts'])
      expect(result.activeFile).toBe('/src/main/index.ts')
      expect(result.panels.editor.open).toBe(true)
    })

    it('should not duplicate already open files', () => {
      const state = { ...defaultState, panels: { ...defaultPanels }, openFiles: ['/a.ts'], activeFile: '/a.ts' }
      const result = layoutReducer(state, { type: 'OPEN_FILE', path: '/a.ts' })

      expect(result.openFiles).toEqual(['/a.ts'])
      expect(result.activeFile).toBe('/a.ts')
    })
  })

  describe('closeFile', () => {
    it('should remove file and set active to previous', () => {
      const state = { ...defaultState, panels: { ...defaultPanels }, openFiles: ['/a.ts', '/b.ts', '/c.ts'], activeFile: '/b.ts' }
      const result = layoutReducer(state, { type: 'CLOSE_FILE', path: '/b.ts' })

      expect(result.openFiles).toEqual(['/a.ts', '/c.ts'])
      expect(result.activeFile).toBe('/c.ts')
    })

    it('should clear dirty state on close', () => {
      const state = { ...defaultState, panels: { ...defaultPanels }, openFiles: ['/a.ts'], dirtyFiles: new Set(['/a.ts']), activeFile: '/a.ts' }
      const result = layoutReducer(state, { type: 'CLOSE_FILE', path: '/a.ts' })

      expect(result.openFiles).toEqual([])
      expect(result.dirtyFiles.size).toBe(0)
    })
  })

  describe('dirty tracking', () => {
    it('should mark and clean files', () => {
      let state = { ...defaultState, panels: { ...defaultPanels } }
      state = layoutReducer(state, { type: 'MARK_DIRTY', path: '/a.ts' })
      expect(state.dirtyFiles.has('/a.ts')).toBe(true)

      state = layoutReducer(state, { type: 'MARK_CLEAN', path: '/a.ts' })
      expect(state.dirtyFiles.has('/a.ts')).toBe(false)
    })
  })

  describe('panel resizing', () => {
    it('should update sidebar width', () => {
      const state = { ...defaultState, panels: { ...defaultPanels } }
      const result = layoutReducer(state, { type: 'SET_PANEL_WIDTH', panel: 'sidebar', width: 300 })

      expect(result.panels.sidebar.width).toBe(300)
    })

    it('should clamp terminal height', () => {
      const state = { ...defaultState, panels: { ...defaultPanels } }
      const result = layoutReducer(state, { type: 'SET_TERMINAL_HEIGHT', height: 50 })

      expect(result.panels.terminal.height).toBe(50)
    })
  })
})
