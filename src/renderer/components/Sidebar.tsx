import { useState } from 'react'
import { Session, ProviderInfo } from '../types'
import { ExternalLink } from 'lucide-react'

const SIDEBAR_WIDTH = 280

interface SidebarProps {
  sessions: Session[]
  activeSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onDeleteSession: (id: string) => void
  onOpenSettings: () => void
  providers: ProviderInfo[]
  onToggleToolInspector: () => void
  showToolInspector: boolean
  pendingToolCallCount: number
  sessionTokenTotals: Record<string, number>
}

const providerColors: Record<string, string> = {
  openai: '#10a37f',
  anthropic: '#d46f2f',
  gemini: '#4285f4',
  qwen: '#615ef0',
  openrouter: '#3b82f6',
  copilot: '#24292e',
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  onOpenSettings,
  providers,
  onToggleToolInspector,
  showToolInspector,
  pendingToolCallCount,
  sessionTokenTotals,
}: SidebarProps) {
  const connectedCount = providers.filter((p) => p.status === 'connected').length

  return (
    <div
      style={{
        width: SIDEBAR_WIDTH,
        minWidth: SIDEBAR_WIDTH,
        height: '100vh',
        backgroundColor: '#0d1117',
        borderRight: '1px solid #21262d',
        display: 'flex',
        flexDirection: 'column',
        color: '#c9d1d9',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #21262d' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              margin: 0,
              background: 'linear-gradient(135deg, #e94560 0%, #615ef0 50%, #4285f4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '-0.02em',
            }}
          >
            Singularity
          </h1>
          <button
            onClick={onToggleToolInspector}
            title="Toggle Tool Call Inspector"
            style={{
              backgroundColor: showToolInspector ? '#238636' : '#21262d',
              border: `1px solid ${showToolInspector ? '#2ea043' : '#30363d'}`,
              color: showToolInspector ? '#fff' : '#8b949e',
              padding: '4px 8px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              position: 'relative',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = showToolInspector ? '#2ea043' : '#30363d'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = showToolInspector ? '#238636' : '#21262d'
            }}
          >
            <span style={{ fontSize: '0.9rem' }}>\uD83D\uDD27</span>
            {pendingToolCallCount > 0 && (
              <span
                style={{
                  backgroundColor: '#d29922',
                  color: '#0d1117',
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  padding: '1px 4px',
                  borderRadius: '8px',
                  minWidth: '14px',
                  textAlign: 'center',
                  lineHeight: 1,
                }}
              >
                {pendingToolCallCount}
              </span>
            )}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '8px' }}>
          {providers.slice(0, 6).map((p) => (
            <div
              key={p.id}
              title={`${p.name}: ${p.status}`}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: p.status === 'connected' ? '#3fb950' : '#484f58',
                boxShadow:
                  p.status === 'connected' ? '0 0 4px #3fb950' : 'none',
              }}
            />
          ))}
          <span style={{ fontSize: '0.7rem', color: '#484f58', marginLeft: '4px' }}>
            {connectedCount}/{providers.length}
          </span>
        </div>
      </div>

      {/* New Session Button */}
      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={onNewSession}
          style={{
            width: '100%',
            padding: '10px 16px',
            backgroundColor: '#238636',
            color: '#fff',
            border: '1px solid #2ea043',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background-color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#2ea043'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#238636'
          }}
        >
          <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>+</span>
          New Session
        </button>
      </div>

      {/* Session List */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '0 8px',
        }}
      >
        {sessions.map((session) => {
          const isActive = session.id === activeSessionId
          const providerColor = providerColors[session.provider] || '#484f58'
          const timeStr = formatTime(session.updatedAt)
          const tokenTotal = sessionTokenTotals[session.id] || 0

          return (
            <SessionItem
              key={session.id}
              session={session}
              isActive={isActive}
              providerColor={providerColor}
              timeStr={timeStr}
              tokenTotal={tokenTotal}
              onSelect={() => onSelectSession(session.id)}
              onDelete={() => onDeleteSession(session.id)}
            />
          )
        })}
        {sessions.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: '#484f58',
              padding: '24px 16px',
              fontSize: '0.85rem',
            }}
          >
            No sessions yet.
            <br />
            Start a new conversation!
          </div>
        )}
      </div>

      {/* Settings Button */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #21262d',
        }}
      >
        <button
          onClick={onOpenSettings}
          style={{
            width: '100%',
            padding: '10px 16px',
            backgroundColor: 'transparent',
            color: '#8b949e',
            border: '1px solid #30363d',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#21262d'
            e.currentTarget.style.color = '#c9d1d9'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
            e.currentTarget.style.color = '#8b949e'
          }}
        >
          <GearIcon />
          Settings
        </button>
      </div>
    </div>
  )
}

function SessionItem({
  session,
  isActive,
  providerColor,
  timeStr,
  tokenTotal,
  onSelect,
  onDelete,
}: {
  session: Session
  isActive: boolean
  providerColor: string
  timeStr: string
  tokenTotal: number
  onSelect: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)

  const handleOpenInNewWindow = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await window.api.openNewWindow({ route: '#/editor' })
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      style={{
        padding: '10px 12px',
        marginBottom: '4px',
        borderRadius: '8px',
        cursor: 'pointer',
        backgroundColor: isActive ? '#161b22' : 'transparent',
        border: isActive ? '1px solid #30363d' : '1px solid transparent',
        transition: 'all 0.15s',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <div
        style={{
          width: 4,
          height: '100%',
          minWidth: 4,
          borderRadius: '2px',
          backgroundColor: providerColor,
          alignSelf: 'stretch',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.85rem',
            fontWeight: 500,
            color: isActive ? '#c9d1d9' : '#8b949e',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {session.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
          <span
            style={{
              fontSize: '0.65rem',
              color: providerColor,
              backgroundColor: providerColor + '20',
              padding: '1px 5px',
              borderRadius: '3px',
              fontWeight: 600,
              textTransform: 'uppercase',
            }}
          >
            {session.provider}
          </span>
          <span style={{ fontSize: '0.7rem', color: '#484f58' }}>{timeStr}</span>
          {tokenTotal > 0 && (
            <span style={{ fontSize: '0.65rem', color: '#484f58', fontFamily: 'monospace' }}>
              {'\u03A3'} {tokenTotal.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      {hovered && (
        <button
          onClick={handleOpenInNewWindow}
          title="Open in New Window"
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.7,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#58a6ff' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = '#8b949e' }}
        >
          <ExternalLink size={12} />
        </button>
      )}
      {hovered && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#f85149',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            opacity: 0.7,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.7'
          }}
          title="Delete session"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  )
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z" />
      <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.421 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.421-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.116l.094-.318z" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M11 1.75V3h2.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H5V1.75C5 .784 5.784 0 6.75 0h2.5C10.216 0 11 .784 11 1.75ZM4.496 6.673a.75.75 0 1 0-1.492.154l.66 6.6A1.75 1.75 0 0 0 5.41 15h5.18a1.75 1.75 0 0 0 1.746-1.573l.66-6.6a.75.75 0 0 0-1.492-.154l-.66 6.6a.25.25 0 0 1-.249.227H5.41a.25.25 0 0 1-.249-.227l-.66-6.6Z" />
    </svg>
  )
}

function formatTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}
