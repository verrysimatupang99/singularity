import { createContext, useContext, useReducer, useCallback, useEffect, type ReactNode } from 'react'

export interface PanelState {
  sidebar: { open: boolean; width: number }
  fileTree: { open: boolean; width: number }
  search: { open: boolean; width: number }
  editor: { open: boolean }
  chat: { open: boolean; width: number }
  terminal: { open: boolean; height: number }
  agent: { open: boolean; width: number }
  orchestrator: { open: boolean; width: number }
  memoryBrowser: { open: boolean; width: number }
  tokenDashboard: { open: boolean; width: number }
}

const DEFAULT_PANELS: PanelState = {
  sidebar: { open: true, width: 260 },
  fileTree: { open: false, width: 240 },
  search: { open: false, width: 240 },
  editor: { open: false },
  chat: { open: true, width: 420 },
  terminal: { open: false, height: 240 },
  agent: { open: false, width: 420 },
  orchestrator: { open: false, width: 420 },
  memoryBrowser: { open: false, width: 420 },
  tokenDashboard: { open: false, width: 420 },
}

interface LayoutState {
  panels: PanelState
  activeFile: string | null
  openFiles: string[]
  dirtyFiles: Set<string>
  workspaceRoot: string | null
  showActivityBar: boolean
}

type LayoutAction =
  | { type: 'TOGGLE_PANEL'; panel: keyof PanelState }
  | { type: 'SET_PANEL_WIDTH'; panel: keyof Omit<PanelState, 'editor' | 'terminal'>; width: number }
  | { type: 'SET_TERMINAL_HEIGHT'; height: number }
  | { type: 'SET_ACTIVE_FILE'; path: string | null }
  | { type: 'OPEN_FILE'; path: string }
  | { type: 'CLOSE_FILE'; path: string }
  | { type: 'MARK_DIRTY'; path: string }
  | { type: 'MARK_CLEAN'; path: string }
  | { type: 'SET_WORKSPACE_ROOT'; path: string | null }
  | { type: 'LOAD_STATE'; state: Partial<LayoutState> }

function layoutReducer(state: LayoutState, action: LayoutAction): LayoutState {
  switch (action.type) {
    case 'TOGGLE_PANEL': {
      const existing = state.panels[action.panel as keyof typeof state.panels]
      if (!existing) return state // Ignore invalid panel keys (e.g. 'settings' which is a view, not a panel)
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.panel]: { ...existing, open: !existing.open },
        },
      }
    }
    case 'SET_PANEL_WIDTH': {
      const panel = action.panel as keyof typeof state.panels
      const existing = state.panels[panel]
      if (!existing || !('width' in existing)) return state
      return {
        ...state,
        panels: {
          ...state.panels,
          [panel]: { ...existing, width: action.width },
        },
      }
    }
    case 'SET_TERMINAL_HEIGHT':
      return {
        ...state,
        panels: {
          ...state.panels,
          terminal: { ...state.panels.terminal, height: action.height },
        },
      }
    case 'SET_ACTIVE_FILE':
      return { ...state, activeFile: action.path }
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
      const newActive =
        state.activeFile === action.path
          ? newFiles[Math.min(idx, newFiles.length - 1)] || null
          : state.activeFile
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
    case 'SET_WORKSPACE_ROOT':
      return { ...state, workspaceRoot: action.path }
    case 'LOAD_STATE':
      return { ...state, ...action.state }
    default:
      return state
  }
}

export interface LayoutContextType {
  panels: PanelState
  togglePanel: (panel: keyof PanelState) => void
  setPanelWidth: (panel: keyof Omit<PanelState, 'editor' | 'terminal'>, width: number) => void
  setTerminalHeight: (height: number) => void
  activeFile: string | null
  setActiveFile: (path: string | null) => void
  openFiles: string[]
  openFile: (path: string) => void
  closeFile: (path: string) => void
  dirtyFiles: Set<string>
  markDirty: (path: string) => void
  markClean: (path: string) => void
  workspaceRoot: string | null
  setWorkspaceRoot: (path: string | null) => void
}

const LayoutContext = createContext<LayoutContextType | null>(null)

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(layoutReducer, {
    panels: DEFAULT_PANELS,
    activeFile: null,
    openFiles: [],
    dirtyFiles: new Set<string>(),
    workspaceRoot: null,
    showActivityBar: true,
  } as LayoutState)

  const togglePanel = useCallback((panel: keyof PanelState) => {
    dispatch({ type: 'TOGGLE_PANEL', panel })
  }, [])

  const setPanelWidth = useCallback((panel: keyof Omit<PanelState, 'editor' | 'terminal'>, width: number) => {
    dispatch({ type: 'SET_PANEL_WIDTH', panel, width: Math.max(150, Math.min(800, width)) })
  }, [])

  const setTerminalHeight = useCallback((height: number) => {
    dispatch({ type: 'SET_TERMINAL_HEIGHT', height: Math.max(100, Math.min(600, height)) })
  }, [])

  const openFile = useCallback((path: string) => {
    dispatch({ type: 'OPEN_FILE', path })
  }, [])

  const closeFile = useCallback((path: string) => {
    dispatch({ type: 'CLOSE_FILE', path })
  }, [])

  const markDirty = useCallback((path: string) => {
    dispatch({ type: 'MARK_DIRTY', path })
  }, [])

  const markClean = useCallback((path: string) => {
    dispatch({ type: 'MARK_CLEAN', path })
  }, [])

  const setWorkspaceRoot = useCallback((path: string | null) => {
    dispatch({ type: 'SET_WORKSPACE_ROOT', path })
  }, [])

  // Persist to settings (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      window.api.settingsSet({
        layout: {
          panels: state.panels,
          workspaceRoot: state.workspaceRoot,
        },
      } as unknown as Partial<import('../../renderer/types').AppSettings>).catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [state.panels, state.workspaceRoot])

  // Load from settings on mount
  useEffect(() => {
    window.api.settingsGet().then((s: import('../../renderer/types').AppSettings) => {
      if ((s as any)?.layout) {
        dispatch({ type: 'LOAD_STATE', state: (s as any).layout })
      }
    }).catch(() => {})
  }, [])

  const value: LayoutContextType = {
    panels: state.panels,
    togglePanel,
    setPanelWidth,
    setTerminalHeight,
    activeFile: state.activeFile,
    setActiveFile: (path) => dispatch({ type: 'SET_ACTIVE_FILE', path }),
    openFiles: state.openFiles,
    openFile,
    closeFile,
    dirtyFiles: state.dirtyFiles,
    markDirty,
    markClean,
    workspaceRoot: state.workspaceRoot,
    setWorkspaceRoot,
  }

  return <LayoutContext.Provider value={value}>{children}</LayoutContext.Provider>
}

export function useLayout(): LayoutContextType {
  const ctx = useContext(LayoutContext)
  if (!ctx) throw new Error('useLayout must be used within LayoutProvider')
  return ctx
}
