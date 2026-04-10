import { useState, useCallback } from 'react'

interface LogEntry { timestamp: number; action: string; success: boolean; error?: string }

export default function ComputerUseView() {
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])

  const addLog = useCallback((action: string, success: boolean, error?: string) => {
    setLogs(prev => [{ timestamp: Date.now(), action, success, error }, ...prev].slice(0, 50))
  }, [])

  const handleScreenshot = useCallback(async () => {
    const result = await (window as any).api.cuScreenshot()
    if (result.success) {
      setScreenshot(result.screenshot)
      addLog('Screenshot', true, `${Math.ceil((result.screenshot?.length || 0) * 0.75 / 1024)}KB`)
    } else {
      addLog('Screenshot', false, result.error)
    }
  }, [addLog])

  const handleClick = useCallback(async () => {
    const x = 512, y = 300
    const result = await (window as any).api.cuAction({ type: 'click', x, y })
    addLog(`Click (${x},${y})`, result.success, result.error)
  }, [addLog])

  const handleType = useCallback(async () => {
    const text = prompt('Text to type:')
    if (!text) return
    const result = await (window as any).api.cuAction({ type: 'type', text })
    addLog(`Type "${text.slice(0, 30)}"`, result.success, result.error)
  }, [addLog])

  const handleKey = useCallback(async () => {
    const key = prompt('Key to press (Enter, Escape, Tab, etc.):')
    if (!key) return
    const result = await (window as any).api.cuAction({ type: 'key', key })
    addLog(`Key ${key}`, result.success, result.error)
  }, [addLog])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0d1117' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #21262d', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Computer Use</span>
      </div>

      {/* Screenshot preview */}
      <div style={{ padding: 12, borderBottom: '1px solid #21262d' }}>
        <button onClick={handleScreenshot} style={{ padding: '6px 16px', backgroundColor: '#1f6feb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, marginBottom: 8 }}>Take Screenshot</button>
        {screenshot && (
          <img src={`data:image/png;base64,${screenshot}`} alt="Screenshot" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, border: '1px solid #30363d' }} />
        )}
      </div>

      {/* Manual controls */}
      <div style={{ padding: 12, borderBottom: '1px solid #21262d', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button onClick={handleClick} style={{ padding: '4px 12px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Click (512,300)</button>
        <button onClick={handleType} style={{ padding: '4px 12px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Type...</button>
        <button onClick={handleKey} style={{ padding: '4px 12px', backgroundColor: '#21262d', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>Press Key...</button>
      </div>

      {/* Action log */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 8 }}>Action Log</div>
        {logs.map((log, i) => (
          <div key={i} style={{ fontSize: 11, padding: '2px 0', color: log.success ? '#3fb950' : '#f85149' }}>
            {log.success ? 'OK' : 'FAIL'} {log.action} {log.error && `— ${log.error}`}
          </div>
        ))}
        {logs.length === 0 && <div style={{ fontSize: 11, color: '#484f58' }}>No actions yet. Take a screenshot to start.</div>}
      </div>
    </div>
  )
}
