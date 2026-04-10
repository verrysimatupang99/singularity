import { useMemo } from 'react'

interface ContextMeterProps {
  messages: Array<{
    tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  }>
  contextWindow: number
  modelName: string
}

export default function ContextMeter({ messages, contextWindow, modelName }: ContextMeterProps) {
  const totalTokens = useMemo(() => {
    return messages.reduce((sum, msg) => {
      return sum + (msg.tokenUsage?.totalTokens ?? 0)
    }, 0)
  }, [messages])

  const pct = contextWindow > 0 ? Math.min((totalTokens / contextWindow) * 100, 100) : 0
  const isWarning = pct >= 70
  const isDanger = pct >= 90

  const barColor = isDanger ? '#f85149' : isWarning ? '#d29922' : '#3fb950'
  const bgColor = isDanger ? 'rgba(248,81,73,0.1)' : isWarning ? 'rgba(210,153,34,0.1)' : 'transparent'

  const formatNum = (n: number) => n.toLocaleString()

  if (contextWindow === 0 || totalTokens === 0) return null

  return (
    <div style={{
      padding: '6px 12px',
      backgroundColor: bgColor,
      fontSize: 11,
      color: '#8b949e',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      borderBottom: '1px solid #21262d',
    }}>
      <span style={{ whiteSpace: 'nowrap' }}>Context:</span>
      <div style={{
        flex: 1,
        height: 6,
        backgroundColor: '#21262d',
        borderRadius: 3,
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: barColor,
          borderRadius: 3,
          transition: 'width 0.3s ease, background-color 0.3s ease',
        }} />
      </div>
      <span title={pct >= 90 ? 'Approaching context limit — consider starting a new session' : undefined}>
        {formatNum(totalTokens)} / {formatNum(contextWindow)} ({Math.round(pct)}%)
      </span>
    </div>
  )
}
