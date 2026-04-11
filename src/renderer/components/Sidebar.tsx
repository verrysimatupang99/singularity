import { useCallback, useState } from 'react'
import { Session } from '../types'
import { ChevronDown, ChevronRight, FolderTree, MessageSquare, Plus, X, Settings } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SidebarProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
  onOpenSettings: () => void
  workspaceRoot: string | null
  onOpenFile?: (path: string) => void
}

type Section = 'files' | 'sessions'

const providerColors: Record<string, string> = {
  anthropic: '#af6eff',
  openai: '#10a37f',
  gemini: '#1a73e8',
  copilot: '#ffffff',
  openrouter: '#7c3aed',
  qwen: '#615ef0',
  ollama: '#000000',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenSettings,
  workspaceRoot,
  onOpenFile,
}: SidebarProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set(['root']))
  const [fileEntries, setFileEntries] = useState<Array<{ name: string; path: string; type: 'dir' | 'file'; size: number; ext: string }>>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  // Load files when workspace changes
  const loadFiles = useCallback(async (dirPath: string) => {
    setLoadingFiles(true)
    try {
      const entries = await window.api.fsReadDir(dirPath)
      setFileEntries(entries)
    } catch { /* ignore */ }
    finally { setLoadingFiles(false) }
  }, [])

  // Auto-load on workspace change
  useState(() => {
    if (workspaceRoot) loadFiles(workspaceRoot)
  })

  const toggleDir = useCallback(async (path: string) => {
    const next = new Set(expandedFiles)
    if (next.has(path)) next.delete(path)
    else {
      next.add(path)
      // Load subdirectory
      try {
        const entries = await window.api.fsReadDir(path)
        setFileEntries(prev => [...prev.filter(e => e.path !== path), ...entries])
      } catch { /* ignore */ }
    }
    setExpandedFiles(next)
  }, [expandedFiles])

  return (
    <aside
      style={{
        width: 260,
        minWidth: 260,
        backgroundColor: 'var(--surface-container-low)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRight: '1px solid rgba(62, 73, 74, 0.1)',
      }}
    >
      {/* App name */}
      <div style={{
        padding: '16px 16px 8px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--on-surface)',
        }}>
          Singularity
        </span>
        <button
          onClick={onOpenSettings}
          title="Settings"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--on-surface-variant)',
            cursor: 'pointer',
            padding: 4,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            opacity: 0.5,
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
          onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Sections */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
        {/* File Tree */}
        <FileTreeSection
          entries={fileEntries}
          expanded={expandedFiles}
          onToggle={toggleDir}
          onOpenFile={onOpenFile}
          loading={loadingFiles}
          workspaceRoot={workspaceRoot}
        />

        {/* Sessions */}
        <SessionsSection
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={onSelectSession}
          onNewSession={onNewSession}
          onDeleteSession={onDeleteSession}
        />
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------
// File Tree Section
// ---------------------------------------------------------------------------

function FileTreeSection({
  entries,
  expanded,
  onToggle,
  onOpenFile,
  loading,
  workspaceRoot,
}: {
  entries: Array<{ name: string; path: string; type: 'dir' | 'file'; size: number; ext: string }>
  expanded: Set<string>
  onToggle: (path: string) => void
  onOpenFile?: (path: string) => void
  loading: boolean
  workspaceRoot: string | null
}) {
  const dirs = entries.filter(e => e.type === 'dir')
  const files = entries.filter(e => e.type === 'file')

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 8px',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--on-surface-variant)',
        opacity: 0.7,
      }}>
        <FolderTree size={12} />
        Explorer
      </div>

      {loading && (
        <div style={{ padding: '8px', fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.4 }}>
          Loading...
        </div>
      )}

      {!loading && !workspaceRoot && (
        <div style={{ padding: '8px', fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.4 }}>
          No workspace open
        </div>
      )}

      {!loading && workspaceRoot && dirs.length === 0 && files.length === 0 && (
        <div style={{ padding: '8px', fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.4 }}>
          Empty directory
        </div>
      )}

      {dirs.map(dir => (
        <div
          key={dir.path}
          onClick={() => onToggle(dir.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            fontSize: 12,
            color: 'var(--on-surface)',
            cursor: 'pointer',
            borderRadius: 3,
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-container-high)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {expanded.has(dir.path) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          📁 {dir.name}
        </div>
      ))}

      {files.map(file => (
        <div
          key={file.path}
          onClick={() => onOpenFile?.(file.path)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px 3px 24px',
            fontSize: 12,
            color: 'var(--on-surface-variant)',
            cursor: 'pointer',
            borderRadius: 3,
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-container-high)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          {getFileIcon(file.ext)} {file.name}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sessions Section
// ---------------------------------------------------------------------------

function SessionsSection({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--on-surface-variant)',
          opacity: 0.7,
        }}>
          <MessageSquare size={12} />
          Sessions
        </div>
        <button
          onClick={onNewSession}
          title="New Session"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--primary)',
            cursor: 'pointer',
            padding: 2,
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
          }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-container-high)'}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <Plus size={14} />
        </button>
      </div>

      {sessions.map(session => {
        const isActive = session.id === activeSessionId
        const pColor = providerColors[session.provider] || 'var(--on-surface-variant)'

        return (
          <div
            key={session.id}
            onClick={() => onSelectSession(session.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              margin: '0 0 2px',
              borderRadius: 4,
              cursor: 'pointer',
              backgroundColor: isActive ? 'var(--surface-container-highest)' : 'transparent',
              borderLeft: isActive ? `2px solid var(--primary)` : '2px solid transparent',
              position: 'relative',
            }}
            onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--surface-container-high)' }}
            onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: pColor,
              flexShrink: 0,
              opacity: 0.8,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12,
                color: 'var(--on-surface)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {session.name || 'Untitled'}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id) }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--on-surface-variant)',
                cursor: 'pointer',
                padding: 2,
                borderRadius: 2,
                display: 'flex',
                opacity: 0,
                transition: 'opacity 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#f85149' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.color = 'var(--on-surface-variant)' }}
            >
              <X size={12} />
            </button>
          </div>
        )
      })}

      {sessions.length === 0 && (
        <div style={{ padding: '12px 8px', fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.4 }}>
          No sessions
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getFileIcon(ext: string): string {
  const icons: Record<string, string> = {
    ts: '🔷', tsx: '⚛️', js: '📜', jsx: '⚛️', py: '🐍',
    json: '📋', md: '📝', css: '🎨', html: '🌐',
    rs: '🦀', go: '🔵', rb: '💎', sh: '⬛',
  }
  return icons[ext] || '📄'
}
