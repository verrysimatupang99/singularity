import { useState, useEffect, useCallback } from 'react'

interface StatusBarProps {
  provider: string
  model: string
  tokenCount?: number
  contextWindow?: number
  ollamaAvailable?: boolean
}

export default function StatusBar({ provider, model, tokenCount, contextWindow, ollamaAvailable }: StatusBarProps) {
  const [ollamaStatus, setOllamaStatus] = useState<{ available: boolean } | null>(null)

  const checkOllama = useCallback(async () => {
    try {
      const status = await window.api.ollamaStatus()
      setOllamaStatus({ available: status.available })
    } catch {
      setOllamaStatus({ available: false })
    }
  }, [])

  useEffect(() => {
    checkOllama()
    const interval = setInterval(checkOllama, 30000)
    return () => clearInterval(interval)
  }, [checkOllama])

  const isOllama = provider === 'ollama'
  const effectiveOllamaStatus = isOllama ? (ollamaStatus?.available ?? false) : (ollamaAvailable ?? false)
  const contextPct = contextWindow && tokenCount ? Math.min((tokenCount / contextWindow) * 100, 100) : 0

  const baseStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    height: 24,
    backgroundColor: 'var(--surface-container-lowest)',
    borderTop: '1px solid rgba(62, 73, 74, 0.15)',
    padding: '0 12px',
    fontSize: 11,
    color: 'var(--on-surface-variant)',
    gap: 16,
    fontFamily: 'monospace',
  }

  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  }

  const dotStyle = (color: string): React.CSSProperties => ({
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: color,
    boxShadow: `0 0 4px ${color}66`,
  })

  return (
    <div style={baseStyle}>
      {/* Provider */}
      <span style={itemStyle}>
        <span style={dotStyle('var(--primary)')} />
        {provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : '—'}
      </span>

      {/* Model */}
      <span style={{ opacity: 0.7 }}>
        {model || '—'}
      </span>

      {/* Context */}
      {tokenCount && tokenCount > 0 && (
        <span style={{ ...itemStyle, opacity: 0.7 }}>
          {tokenCount.toLocaleString()} tokens
          {contextWindow && (
            <span style={{ color: contextPct >= 90 ? '#f85149' : contextPct >= 70 ? '#d29922' : '#3fb950' }}>
              ({Math.round(contextPct)}%)
            </span>
          )}
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Ollama Status */}
      {ollamaStatus !== null && (
        <span style={itemStyle}>
          <span style={dotStyle(effectiveOllamaStatus ? '#3fb950' : '#484f58')} />
          Ollama {effectiveOllamaStatus ? 'running' : 'offline'}
        </span>
      )}
    </div>
  )
}
