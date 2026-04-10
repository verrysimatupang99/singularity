import { useState, useEffect, useCallback } from 'react'

interface MemoryEntry {
  id: string
  timestamp: number
  key: string
  value: string
  tags: string[]
  sessionId?: string
}

export default function MemoryBrowser() {
  const [entries, setEntries] = useState<MemoryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState<string | null>(null)

  const loadEntries = useCallback(async (query?: string) => {
    setLoading(true)
    try {
      const result = query
        ? await window.api.memorySearch(query)
        : await window.api.memoryList()
      setEntries(result)
    } catch (err) {
      console.error('Failed to load memory entries:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadEntries()
  }, [loadEntries])

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    loadEntries(searchQuery)
  }, [loadEntries, searchQuery])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await window.api.memoryDeleteById(id)
      setFeedback('Entry deleted')
      loadEntries(searchQuery)
    } catch (err) {
      setFeedback('Failed to delete entry')
    }
    setTimeout(() => setFeedback(null), 2000)
  }, [loadEntries, searchQuery])

  const handleEdit = useCallback((entry: MemoryEntry) => {
    setEditingId(entry.id)
    setEditValue(entry.value)
  }, [])

  const handleSaveEdit = useCallback(async (id: string) => {
    try {
      await window.api.memoryUpdate(id, editValue)
      setEditingId(null)
      setEditValue('')
      setFeedback('Entry updated')
      loadEntries(searchQuery)
    } catch (err) {
      setFeedback('Failed to update entry')
    }
    setTimeout(() => setFeedback(null), 2000)
  }, [editValue, loadEntries, searchQuery])

  const handleCancelEdit = useCallback(() => {
    setEditingId(null)
    setEditValue('')
  }, [])

  const handleClearAll = useCallback(async () => {
    if (!confirm('Are you sure you want to clear all memory entries? This cannot be undone.')) return
    try {
      await window.api.memoryClear()
      setEntries([])
      setFeedback('All memory cleared')
    } catch (err) {
      setFeedback('Failed to clear memory')
    }
    setTimeout(() => setFeedback(null), 2000)
  }, [])

  const formatTime = (ts: number): string => {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
  }

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      backgroundColor: '#0d1117',
      color: '#c9d1d9',
      padding: '20px 24px',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#f0f6fc' }}>Agent Memory Browser</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => loadEntries()}
            style={{
              backgroundColor: '#21262d',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#c9d1d9',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Refresh
          </button>
          <button
            onClick={handleClearAll}
            style={{
              backgroundColor: '#da3633',
              border: '1px solid #f85149',
              borderRadius: 6,
              color: '#fff',
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div style={{
          backgroundColor: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 6,
          padding: '8px 12px',
          marginBottom: 12,
          fontSize: 13,
          color: '#58a6ff',
        }}>
          {feedback}
        </div>
      )}

      {/* Search */}
      <form onSubmit={handleSearch} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memory by key, value, or tags..."
            style={{
              flex: 1,
              padding: '8px 12px',
              backgroundColor: '#0d1117',
              border: '1px solid #30363d',
              borderRadius: 6,
              color: '#c9d1d9',
              fontSize: 13,
              outline: 'none',
            }}
          />
          <button
            type="submit"
            style={{
              backgroundColor: '#238636',
              border: '1px solid #2ea043',
              borderRadius: 6,
              color: '#fff',
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Search
          </button>
        </div>
      </form>

      {/* Entries */}
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: '#8b949e' }}>
          Loading...
        </div>
      ) : entries.length === 0 ? (
        <div style={{ color: '#8b949e', fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
          {searchQuery ? 'No results found' : 'No memory entries yet'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entries.map((entry) => (
            <div
              key={entry.id}
              style={{
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: 8,
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#f0f6fc' }}>
                    {entry.key}
                  </div>
                  {entry.tags && entry.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
                      {entry.tags.map((tag, i) => (
                        <span
                          key={i}
                          style={{
                            backgroundColor: '#21262d',
                            border: '1px solid #30363d',
                            borderRadius: 12,
                            padding: '2px 8px',
                            fontSize: 11,
                            color: '#8b949e',
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#8b949e' }}>
                    {formatTime(entry.timestamp)}
                  </span>
                  {editingId !== entry.id && (
                    <>
                      <button
                        onClick={() => handleEdit(entry)}
                        style={{
                          backgroundColor: '#21262d',
                          border: '1px solid #30363d',
                          borderRadius: 4,
                          color: '#c9d1d9',
                          padding: '2px 8px',
                          cursor: 'pointer',
                          fontSize: 11,
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(entry.id)}
                        style={{
                          backgroundColor: '#da3633',
                          border: '1px solid #f85149',
                          borderRadius: 4,
                          color: '#fff',
                          padding: '2px 8px',
                          cursor: 'pointer',
                          fontSize: 11,
                        }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editingId === entry.id ? (
                <div>
                  <textarea
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    rows={4}
                    style={{
                      width: '100%',
                      padding: 8,
                      backgroundColor: '#0d1117',
                      border: '1px solid #30363d',
                      borderRadius: 6,
                      color: '#c9d1d9',
                      fontSize: 13,
                      fontFamily: 'monospace',
                      resize: 'vertical',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button
                      onClick={() => handleSaveEdit(entry.id)}
                      style={{
                        backgroundColor: '#238636',
                        border: '1px solid #2ea043',
                        borderRadius: 4,
                        color: '#fff',
                        padding: '4px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Save
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      style={{
                        backgroundColor: '#21262d',
                        border: '1px solid #30363d',
                        borderRadius: 4,
                        color: '#c9d1d9',
                        padding: '4px 12px',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{
                  fontSize: 13,
                  color: '#c9d1d9',
                  backgroundColor: '#0d1117',
                  borderRadius: 4,
                  padding: 8,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 120,
                  overflow: 'auto',
                }}>
                  {entry.value}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
