import { useCallback } from 'react'
import { Session } from '../types'
import { useLayout } from '../context/LayoutContext'

interface SidebarProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
  providers: Array<{ id: string; name: string; status: string }>
}

const providerColors: Record<string, string> = {
  anthropic: '#af6eff',
  openai: '#10a37f',
  gemini: '#1a73e8',
  copilot: '#ffffff',
  openrouter: '#7c3aed',
  qwen: '#615ef0',
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
}: SidebarProps) {
  const { panels, togglePanel } = useLayout()

  const handleNewSession = useCallback(() => {
    if (!panels.chat.open) togglePanel('chat' as any)
    onNewSession()
  }, [panels.chat.open, togglePanel, onNewSession])

  return (
    <section
      style={{
        width: 260,
        minWidth: 260,
        backgroundColor: 'var(--surface-container-low)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{
        padding: 16,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <h2 style={{
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: 'var(--on-surface-variant)',
        }}>
          Sessions
        </h2>
        <button
          onClick={handleNewSession}
          title="New Session"
          style={{
            width: 28,
            height: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: 2,
            cursor: 'pointer',
            background: 'transparent',
            color: 'var(--primary)',
            fontSize: 20,
            fontFamily: 'Material Symbols Outlined',
            fontVariationSettings: "'FILL' 1, 'wght' 300",
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-container-high)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          add
        </button>
      </div>

      {/* Session list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sessions.map(session => {
          const isActive = session.id === activeSessionId
          const providerColor = providerColors[session.provider] || 'var(--on-surface-variant)'
          const providerName = session.provider ? session.provider.charAt(0).toUpperCase() + session.provider.slice(1) : 'Unknown'
          const timeAgo = getTimeAgo(session.updatedAt)

          return (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: 8,
                margin: '0 8px 4px',
                borderRadius: 2,
                cursor: 'pointer',
                backgroundColor: isActive ? 'var(--surface)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--primary)' : '2px solid transparent',
                opacity: isActive ? 1 : 0.6,
                transition: 'opacity 0.15s, background-color 0.15s',
                position: 'relative',
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.opacity = '1'
                  e.currentTarget.style.backgroundColor = 'var(--surface-container-high)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.opacity = '0.6'
                  e.currentTarget.style.backgroundColor = 'transparent'
                }
              }}
            >
              {/* Provider avatar */}
              <div style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: `${providerColor}15`,
                flexShrink: 0,
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: providerColor,
                  opacity: 0.8,
                }} />
              </div>

              {/* Session info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--on-surface)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {session.name || 'Untitled Session'}
                </div>
                <div style={{
                  fontSize: 10,
                  color: 'var(--on-surface-variant)',
                  opacity: 0.6,
                }}>
                  {providerName} · {timeAgo}
                </div>
              </div>

              {/* Delete button (appears on hover) */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDeleteSession(session.id)
                }}
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 20,
                  height: 20,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  borderRadius: 2,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: 'var(--on-surface-variant)',
                  fontSize: 14,
                  opacity: 0,
                  transition: 'opacity 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '1'
                  e.currentTarget.style.background = 'var(--surface-container-highest)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '0'
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                ×
              </button>
            </div>
          )
        })}

        {sessions.length === 0 && (
          <div style={{
            padding: '24px 16px',
            textAlign: 'center',
            color: 'var(--on-surface-variant)',
            opacity: 0.4,
            fontSize: 13,
          }}>
            No sessions yet
          </div>
        )}
      </div>
    </section>
  )
}

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}
