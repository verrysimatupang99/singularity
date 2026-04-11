import { useCallback, useState, useEffect } from 'react'
import { Session } from '../types'
import { ChevronDown, ChevronRight, FolderTree, MessageSquare, Plus, X, Settings, FolderOpen } from 'lucide-react'

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

const providerColors: Record<string, string> = {
  anthropic: '#af6eff', openai: '#10a37f', gemini: '#1a73e8',
  copilot: '#ffffff', openrouter: '#7c3aed', qwen: '#615ef0', ollama: '#72d6de',
}

export default function Sidebar({
  sessions, activeSessionId, onSelectSession, onNewSession, onDeleteSession,
  onOpenSettings, workspaceRoot, onOpenFile,
}: SidebarProps) {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(workspaceRoot ? [workspaceRoot] : []))
  const [fileEntries, setFileEntries] = useState<Array<{ name: string; path: string; type: 'dir' | 'file'; size: number; ext: string }>>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  // Load root directory when workspace changes
  useEffect(() => {
    if (!workspaceRoot) { setFileEntries([]); return }
    loadDir(workspaceRoot)
  }, [workspaceRoot])

  const loadDir = useCallback(async (dirPath: string) => {
    setLoadingFiles(true)
    try {
      const entries = await window.api.fsReadDir(dirPath)
      // Merge or replace entries for this directory
      setFileEntries(prev => {
        const other = prev.filter(e => !e.path.startsWith(dirPath + '/') && e.path !== dirPath)
        return [...other, ...entries]
      })
    } catch { /* ignore */ }
    finally { setLoadingFiles(false) }
  }, [])

  const toggleDir = useCallback(async (path: string) => {
    const next = new Set(expandedDirs)
    if (next.has(path)) {
      next.delete(path)
      // Remove children
      setFileEntries(prev => prev.filter(e => !e.path.startsWith(path + '/')))
    } else {
      next.add(path)
      await loadDir(path)
    }
    setExpandedDirs(next)
  }, [expandedDirs, loadDir])

  const handleOpenFolder = useCallback(async () => {
    const folderPath = await window.api.fsPickFolder()
    if (folderPath) {
      setExpandedDirs(new Set([folderPath]))
      loadDir(folderPath)
    }
  }, [loadDir])

  // Derived: get dirs and files from entries
  const dirs = fileEntries.filter(e => e.type === 'dir')
  const files = fileEntries.filter(e => e.type === 'file')

  return (
    <aside style={{
      width: 260, minWidth: 260,
      backgroundColor: 'var(--surface-low)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      // No-line rule: tonal boundary only
    }}>
      {/* App name + settings */}
      <div style={{ padding: '12px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--on-surface)' }}>
          Singularity
        </span>
        <button onClick={onOpenSettings} className="ghost-btn" style={{ padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}>
          <Settings size={14} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>

        {/* ===== EXPLORER ===== */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--on-surface-variant)', opacity: 0.6 }}>
              <FolderTree size={12} /> Explorer
            </div>
            {!workspaceRoot && (
              <button onClick={handleOpenFolder} className="ghost-btn" style={{ padding: 2, borderRadius: 3, display: 'flex', alignItems: 'center' }} title="Open Folder">
                <FolderOpen size={12} />
              </button>
            )}
          </div>

          {loadingFiles && <div style={{ padding: '8px 4px', fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.4 }}>Loading...</div>}

          {!loadingFiles && !workspaceRoot && (
            <div style={{ padding: '8px 4px', fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.4 }}>No workspace open</div>
          )}

          {!loadingFiles && workspaceRoot && dirs.length === 0 && files.length === 0 && (
            <div style={{ padding: '8px 4px', fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.4 }}>Empty directory</div>
          )}

          {/* Directories */}
          {dirs.filter(d => expandedDirs.has(d.path) || d.path === workspaceRoot).map(dir => {
            const isRoot = dir.path === workspaceRoot
            const isExpanded = expandedDirs.has(dir.path)
            return (
              <div key={dir.path} onClick={() => !isRoot && toggleDir(dir.path)} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: isRoot ? '4px 4px' : '3px 4px 3px 0',
                paddingLeft: isRoot ? 4 : 16,
                fontSize: 12, color: 'var(--on-surface)',
                cursor: isRoot ? 'default' : 'pointer',
                borderRadius: 3,
              }}
                onMouseEnter={e => { if (!isRoot) e.currentTarget.style.backgroundColor = 'var(--surface-container)' }}
                onMouseLeave={e => { if (!isRoot) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                {isRoot ? null : (isExpanded ? <ChevronDown size={12} style={{ opacity: 0.5 }} /> : <ChevronRight size={12} style={{ opacity: 0.5 }} />)}
                📁 {dir.name}
              </div>
            )
          })}

          {/* Files (only show files in expanded dirs or root) */}
          {files.filter(f => {
            if (!workspaceRoot) return false
            const parentDir = f.path.substring(0, f.path.lastIndexOf('/'))
            return expandedDirs.has(parentDir) || parentDir === workspaceRoot
          }).map(file => (
            <div key={file.path} onClick={() => onOpenFile?.(file.path)} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 4px 3px 24px',
              fontSize: 12, color: 'var(--on-surface-variant)',
              cursor: 'pointer', borderRadius: 3,
            }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-container)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              {getFileIcon(file.ext)} {file.name}
            </div>
          ))}
        </div>

        {/* ===== SESSIONS ===== */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--on-surface-variant)', opacity: 0.6 }}>
              <MessageSquare size={12} /> Sessions
            </div>
            <button onClick={onNewSession} className="ghost-btn" style={{ padding: 2, borderRadius: 3, display: 'flex', alignItems: 'center' }} title="New Session">
              <Plus size={14} />
            </button>
          </div>

          {sessions.map(session => {
            const isActive = session.id === activeSessionId
            const pColor = providerColors[session.provider] || 'var(--on-surface-variant)'
            return (
              <div key={session.id} onClick={() => onSelectSession(session.id)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 8px', margin: '0 0 1px',
                borderRadius: 4, cursor: 'pointer',
                backgroundColor: isActive ? 'var(--surface-container)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                position: 'relative',
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--surface-container)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                {/* Provider dot */}
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: pColor, flexShrink: 0, opacity: 0.8 }} />
                {/* Session name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {session.name || 'Untitled'}
                  </div>
                </div>
                {/* Delete */}
                <button onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id) }}
                  style={{ background: 'none', border: 'none', color: 'var(--on-surface-variant)', cursor: 'pointer', padding: 2, borderRadius: 2, display: 'flex', opacity: 0, transition: 'opacity 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--error)' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.color = 'var(--on-surface-variant)' }}
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}

          {sessions.length === 0 && (
            <div style={{ padding: '12px 4px', fontSize: 11, color: 'var(--on-surface-variant)', opacity: 0.4 }}>No sessions</div>
          )}
        </div>
      </div>
    </aside>
  )
}

function getFileIcon(ext: string): string {
  const icons: Record<string, string> = {
    ts: '🔷', tsx: '⚛️', js: '📜', jsx: '⚛️', py: '🐍',
    json: '📋', md: '📝', css: '🎨', html: '🌐',
    rs: '🦀', go: '🔵', rb: '💎', sh: '⬛',
  }
  return icons[ext] || '📄'
}
