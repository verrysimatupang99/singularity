import { useState, useCallback, useEffect, useRef } from 'react'
import { Play, Square, Check, X, Loader2 } from 'lucide-react'

interface AgentEvent { agentId: string; step: number; type: string; toolCall?: any; result?: any; finalResponse?: string; error?: string }

export default function AgentView({ workspaceRoot }: { workspaceRoot: string | null }) {
  const [task, setTask] = useState('')
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [agentId, setAgentId] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!running) return
    const cleanup = (window as any).api?.onAgentEvent?.((event: AgentEvent) => {
      setEvents(prev => [...prev, event])
    })
    return cleanup
  }, [running])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [events])

  const handleRun = useCallback(async () => {
    if (!task || !workspaceRoot) return
    setRunning(true)
    setEvents([])
    const settings = await (window as any).api.settingsGet()
    const provider = settings.defaultProvider || 'anthropic'
    const model = settings.defaultModel || 'claude-sonnet-4-20250514'
    const result = await (window as any).api.agentExecuteTask({ task, workspaceRoot, provider, model })
    setAgentId(result.agentId)
  }, [task, workspaceRoot])

  const handleApprove = useCallback((approved: boolean) => {
    if (agentId) (window as any).api.agentApprove({ agentId, approved })
  }, [agentId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0d1117' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #21262d', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Agent Mode</span>
        {running && <Loader2 size={14} className="animate-spin" />}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {events.map((ev, i) => (
          <div key={i} style={{ marginBottom: 8, fontSize: 12 }}>
            {ev.type === 'thinking' && <span style={{ color: '#8b949e' }}>Step {ev.step} Thinking...</span>}
            {ev.type === 'tool_call' && <span style={{ color: '#58a6ff' }}>Step {ev.step} {ev.toolCall?.toolName}</span>}
            {ev.type === 'approval_needed' && (
              <div style={{ padding: 8, backgroundColor: '#161b22', borderRadius: 6, border: '1px solid #30363d' }}>
                <span style={{ color: '#d29922' }}>Step {ev.step} Needs approval: {ev.toolCall?.toolName}</span>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <button onClick={() => handleApprove(true)} style={{ padding: '2px 12px', backgroundColor: '#238636', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><Check size={10} /> Approve</button>
                  <button onClick={() => handleApprove(false)} style={{ padding: '2px 12px', backgroundColor: 'transparent', color: '#f85149', border: '1px solid #f85149', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><X size={10} /> Reject</button>
                </div>
              </div>
            )}
            {ev.type === 'tool_result' && <span style={{ color: ev.result?.error ? '#f85149' : '#3fb950' }}>Step {ev.step} {ev.result?.error ? 'Error: '+ev.result.error : 'Done'}</span>}
            {ev.type === 'done' && <div style={{ padding: 8, backgroundColor: '#161b22', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>{ev.finalResponse}</div>}
            {ev.type === 'error' && <span style={{ color: '#f85149' }}>{ev.error}</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={{ padding: 8, borderTop: '1px solid #21262d' }}>
        <textarea value={task} onChange={e => setTask(e.target.value)} rows={2} placeholder="Describe what you want the agent to do..." style={{ width: '100%', padding: 6, fontSize: 12, backgroundColor: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button onClick={handleRun} disabled={running || !task} style={{ padding: '4px 16px', backgroundColor: '#238636', color: '#fff', border: 'none', borderRadius: 6, cursor: running ? 'wait' : 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Play size={12} /> Run Agent</button>
          {running && <button onClick={() => setRunning(false)} style={{ padding: '4px 16px', backgroundColor: 'transparent', color: '#f85149', border: '1px solid #f85149', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Square size={12} /> Stop</button>}
        </div>
      </div>
    </div>
  )
}
