import { useState, useMemo } from 'react'
import { ToolCall } from '../types'

const INSPECTOR_WIDTH = 380

type StatusFilter = 'all' | 'pending' | 'executing' | 'completed' | 'failed'

interface ToolCallInspectorProps {
  toolCalls: ToolCall[]
  onClose: () => void
}

const STATUS_ICONS: Record<ToolCall['status'], string> = {
  pending: '\u23F3',
  executing: '\uD83D\uDD04',
  completed: '\u2705',
  failed: '\u274C',
}

const STATUS_COLORS: Record<ToolCall['status'], string> = {
  pending: '#d29922',
  executing: '#58a6ff',
  completed: '#3fb950',
  failed: '#f85149',
}

const FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Executing', value: 'executing' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
]

export default function ToolCallInspector({ toolCalls, onClose }: ToolCallInspectorProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const filteredToolCalls = useMemo(() => {
    return toolCalls.filter((tc) => {
      const matchesStatus = statusFilter === 'all' || tc.status === statusFilter
      const matchesSearch =
        searchQuery === '' || tc.name.toLowerCase().includes(searchQuery.toLowerCase())
      return matchesStatus && matchesSearch
    })
  }, [toolCalls, statusFilter, searchQuery])

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const formatTimestamp = (ts: number): string => {
    const date = new Date(ts)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div
      style={{
        width: INSPECTOR_WIDTH,
        minWidth: INSPECTOR_WIDTH,
        height: '100vh',
        backgroundColor: '#0d1117',
        borderLeft: '1px solid #21262d',
        display: 'flex',
        flexDirection: 'column',
        color: '#c9d1d9',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1rem' }}>\uD83D\uDD27</span>
          <h2 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Tool Calls</h2>
          {toolCalls.filter((t) => t.status === 'pending').length > 0 && (
            <span
              style={{
                backgroundColor: '#d29922',
                color: '#0d1117',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: '10px',
                minWidth: '18px',
                textAlign: 'center',
              }}
            >
              {toolCalls.filter((t) => t.status === 'pending').length}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#8b949e',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            fontSize: '1.1rem',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#21262d'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="Close inspector"
        >
          &times;
        </button>
      </div>

      {/* Filters */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #21262d' }}>
        {/* Search */}
        <input
          type="text"
          placeholder="Search tool name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '6px',
            color: '#c9d1d9',
            padding: '6px 10px',
            fontSize: '0.8rem',
            outline: 'none',
            marginBottom: '8px',
          }}
        />
        {/* Status filter buttons */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {FILTERS.map((f) => {
            const isActive = statusFilter === f.value
            const count =
              f.value === 'all'
                ? toolCalls.length
                : toolCalls.filter((t) => t.status === f.value).length
            return (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                style={{
                  backgroundColor: isActive ? '#238636' : '#161b22',
                  border: `1px solid ${isActive ? '#2ea043' : '#30363d'}`,
                  color: isActive ? '#fff' : '#8b949e',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.7rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {f.label}
                <span
                  style={{
                    backgroundColor: isActive ? 'rgba(255,255,255,0.2)' : '#21262d',
                    padding: '0 4px',
                    borderRadius: '3px',
                    fontSize: '0.65rem',
                  }}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tool call list */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px',
        }}
      >
        {filteredToolCalls.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#484f58',
              padding: '32px 16px',
              fontSize: '0.85rem',
            }}
          >
            {toolCalls.length === 0
              ? 'No tool calls in this session.'
              : 'No tool calls match the current filters.'}
          </div>
        ) : (
          filteredToolCalls.map((tc) => {
            const isExpanded = expandedIds.has(tc.id)
            return (
              <div
                key={tc.id}
                style={{
                  backgroundColor: '#161b22',
                  border: '1px solid #30363d',
                  borderRadius: '8px',
                  marginBottom: '8px',
                  overflow: 'hidden',
                }}
              >
                {/* Card header */}
                <div
                  onClick={() => toggleExpand(tc.id)}
                  style={{
                    padding: '10px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#1c2128'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <span style={{ fontSize: '0.9rem' }}>
                    {STATUS_ICONS[tc.status]}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      color: STATUS_COLORS[tc.status],
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tc.name}
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#484f58' }}>
                    {formatTimestamp(tc.timestamp)}
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      color: '#484f58',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s',
                    }}
                  >
                    &#9660;
                  </span>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div style={{ padding: '0 12px 12px' }}>
                    {/* Arguments */}
                    <div style={{ marginBottom: '8px' }}>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: '#8b949e',
                          fontWeight: 600,
                          marginBottom: '4px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                        }}
                      >
                        Arguments
                      </div>
                      <pre
                        style={{
                          backgroundColor: '#0d1117',
                          border: '1px solid #21262d',
                          borderRadius: '6px',
                          padding: '8px 10px',
                          fontSize: '0.75rem',
                          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                          color: '#c9d1d9',
                          overflowX: 'auto',
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {syntaxHighlight(JSON.stringify(tc.args, null, 2))}
                      </pre>
                    </div>

                    {/* Result (if available) */}
                    {tc.result !== undefined && (
                      <div>
                        <div
                          style={{
                            fontSize: '0.7rem',
                            color: '#8b949e',
                            fontWeight: 600,
                            marginBottom: '4px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                          }}
                        >
                          Result
                        </div>
                        <pre
                          style={{
                            backgroundColor: '#0d1117',
                            border: `1px solid ${tc.status === 'failed' ? 'rgba(248, 81, 73, 0.3)' : '#21262d'}`,
                            borderRadius: '6px',
                            padding: '8px 10px',
                            fontSize: '0.75rem',
                            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                            color: tc.status === 'failed' ? '#f85149' : '#3fb950',
                            overflowX: 'auto',
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

/** Simple JSON syntax highlighting with colored tokens */
function syntaxHighlight(json: string): string {
  // Escape HTML entities
  let escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Colorize JSON tokens
  escaped = escaped.replace(
    /"([^"]+)":/g,
    '<span style="color: #79c0ff">"$1"</span>:',
  )
  escaped = escaped.replace(
    /: "(.*?)"/g,
    ': <span style="color: #a5d6ff">"$1"</span>',
  )
  escaped = escaped.replace(
    /: (\d+\.?\d*)/g,
    ': <span style="color: #79c0ff">$1</span>',
  )
  escaped = escaped.replace(
    /: (true|false)/g,
    ': <span style="color: #ff7b72">$1</span>',
  )
  escaped = escaped.replace(
    /: (null)/g,
    ': <span style="color: #8b949e">$1</span>',
  )
  return escaped
}
