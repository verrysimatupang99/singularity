import { useState, useEffect, useCallback } from 'react'
import { Wifi, WifiOff, Cpu } from 'lucide-react'

interface StatusBarProps {
  provider: string
  model: string
  tokenCount?: number
  contextWindow?: number
}

export default function StatusBar({ provider, model, tokenCount, contextWindow }: StatusBarProps) {
  const [ollamaAvailable, setOllamaAvailable] = useState(false)

  const checkOllama = useCallback(async () => {
    try {
      const status = await window.api.ollamaStatus()
      setOllamaAvailable(status.available)
    } catch { setOllamaAvailable(false) }
  }, [])

  useEffect(() => {
    checkOllama()
    const interval = setInterval(checkOllama, 30000)
    return () => clearInterval(interval)
  }, [checkOllama])

  const contextPct = contextWindow && tokenCount ? Math.min((tokenCount / contextWindow) * 100, 100) : 0

  const itemStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 11, color: 'var(--on-surface-variant)',
    fontFamily: 'var(--font-mono)', opacity: 0.7,
  }

  const dotStyle = (color: string): React.CSSProperties => ({
    width: 6, height: 6, borderRadius: '50%',
    backgroundColor: color,
  })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 24,
      backgroundColor: 'var(--surface-lowest)',
      borderTop: '1px solid var(--outline-variant)',
      padding: '0 12px',
      fontSize: 11, color: 'var(--on-surface-variant)',
      fontFamily: 'var(--font-mono)',
      gap: 16,
    }}>
      {/* Provider */}
      <span style={itemStyle}>
        <span style={dotStyle('var(--primary)')} />
        {provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : '—'}
      </span>

      {/* Model */}
      {model && <span style={{ ...itemStyle, opacity: 0.5 }}>{model}</span>}

      {/* Context */}
      {tokenCount && tokenCount > 0 && (
        <span style={itemStyle}>
          {tokenCount.toLocaleString()} tokens
          {contextWindow && (
            <span style={{
              color: contextPct >= 90 ? 'var(--error)' : contextPct >= 70 ? 'var(--warning)' : 'var(--success)',
            }}>
              ({Math.round(contextPct)}%)
            </span>
          )}
        </span>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Ollama */}
      <span style={itemStyle}>
        {ollamaAvailable ? <Wifi size={10} color="var(--success)" /> : <WifiOff size={10} color="var(--on-surface-variant)" />}
        Ollama
      </span>
    </div>
  )
}
