import { useState, useEffect, useCallback } from 'react'

type TimeRange = 'today' | 'month'

interface ProviderBreakdown {
  tokens: number
  cost: number
}

export default function TokenDashboard() {
  const [timeRange, setTimeRange] = useState<TimeRange>('today')
  const [todayStats, setTodayStats] = useState<{ tokens: number; cost: number }>({ tokens: 0, cost: 0 })
  const [monthStats, setMonthStats] = useState<{ tokens: number; cost: number }>({ tokens: 0, cost: 0 })
  const [breakdown, setBreakdown] = useState<Record<string, ProviderBreakdown>>({})
  const [recentSessions, setRecentSessions] = useState<Array<{ sessionId: string; tokens: number; cost: number; lastUsed: number }>>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [today, month, bd, recent] = await Promise.all([
        window.api.tokenToday(),
        window.api.tokenMonth(),
        window.api.tokenBreakdown(),
        window.api.tokenRecent(10),
      ])
      setTodayStats(today)
      setMonthStats(month)
      setBreakdown(bd)
      setRecentSessions(recent)
    } catch (err) {
      console.error('Failed to load token data:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const activeStats = timeRange === 'today' ? todayStats : monthStats
  const maxTokens = Math.max(...Object.values(breakdown).map(b => b.tokens), 1)

  const formatTokens = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return n.toString()
  }

  const formatCost = (c: number): string => {
    if (c < 0.01) return `$${c.toFixed(4)}`
    return `$${c.toFixed(2)}`
  }

  const formatTime = (ts: number): string => {
    const d = new Date(ts)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: '#f0f6fc' }}>Token Usage Dashboard</h2>
        <button
          onClick={loadData}
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
      </div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, color: '#8b949e' }}>
          Loading...
        </div>
      ) : (
        <>
          {/* Time Range Toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              onClick={() => setTimeRange('today')}
              style={{
                backgroundColor: timeRange === 'today' ? '#388bfd' : '#21262d',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: timeRange === 'today' ? '#fff' : '#c9d1d9',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: timeRange === 'today' ? 600 : 400,
              }}
            >
              Today
            </button>
            <button
              onClick={() => setTimeRange('month')}
              style={{
                backgroundColor: timeRange === 'month' ? '#388bfd' : '#21262d',
                border: '1px solid #30363d',
                borderRadius: 6,
                color: timeRange === 'month' ? '#fff' : '#c9d1d9',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: timeRange === 'month' ? 600 : 400,
              }}
            >
              This Month
            </button>
          </div>

          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
            <div style={{
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 8,
              padding: 16,
            }}>
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>Total Tokens</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#58a6ff' }}>
                {formatTokens(activeStats.tokens)}
              </div>
            </div>
            <div style={{
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 8,
              padding: 16,
            }}>
              <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>Estimated Cost</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#3fb950' }}>
                {formatCost(activeStats.cost)}
              </div>
            </div>
          </div>

          {/* Provider Breakdown */}
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#f0f6fc' }}>
              Provider Breakdown
            </h3>
            {Object.keys(breakdown).length === 0 ? (
              <div style={{ color: '#8b949e', fontSize: 13, padding: '12px 0' }}>No usage data yet</div>
            ) : (
              Object.entries(breakdown)
                .sort((a, b) => b[1].tokens - a[1].tokens)
                .map(([provider, data]) => {
                  const pct = (data.tokens / maxTokens) * 100
                  return (
                    <div key={provider} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                        <span style={{ color: '#c9d1d9', textTransform: 'capitalize' }}>{provider}</span>
                        <span style={{ color: '#8b949e' }}>
                          {formatTokens(data.tokens)} tokens ({formatCost(data.cost)})
                        </span>
                      </div>
                      <div style={{
                        height: 6,
                        backgroundColor: '#21262d',
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${pct}%`,
                          backgroundColor: '#388bfd',
                          borderRadius: 3,
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                    </div>
                  )
                })
            )}
          </div>

          {/* Recent Sessions */}
          <div>
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#f0f6fc' }}>
              Recent Sessions
            </h3>
            {recentSessions.length === 0 ? (
              <div style={{ color: '#8b949e', fontSize: 13, padding: '12px 0' }}>No session data yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {recentSessions.map((session) => (
                  <div
                    key={session.sessionId}
                    style={{
                      backgroundColor: '#161b22',
                      border: '1px solid #30363d',
                      borderRadius: 6,
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, color: '#c9d1d9' }}>
                        {session.sessionId.slice(0, 16)}...
                      </div>
                      <div style={{ fontSize: 11, color: '#8b949e' }}>
                        {formatTime(session.lastUsed)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, color: '#58a6ff' }}>
                        {formatTokens(session.tokens)} tokens
                      </div>
                      <div style={{ fontSize: 11, color: '#3fb950' }}>
                        {formatCost(session.cost)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
