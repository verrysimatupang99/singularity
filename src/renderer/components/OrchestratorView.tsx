import { useState, useCallback, useEffect, useRef } from 'react'
import { Play, Loader2, CheckCircle, XCircle, SkipForward, Clock } from 'lucide-react'
import { useLayout } from '../context/LayoutContext'

interface SubAgentResult {
  id: string; role: string; status: string; output: string; filesModified: string[]; error?: string; durationMs: number
}

interface OrchEvent {
  orchestratorId: string; type: string; subAgentId?: string; subAgent?: any; result?: SubAgentResult; error?: string; summary?: string
}

export default function OrchestratorView() {
  const { workspaceRoot } = useLayout()
  const [task, setTask] = useState('')
  const [running, setRunning] = useState(false)
  const [plan, setPlan] = useState<any>(null)
  const [events, setEvents] = useState<OrchEvent[]>([])
  const [results, setResults] = useState<Map<string, SubAgentResult>>(new Map())
  const [planning, setPlanning] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!running) return
    const cleanup = (window as any).api?.onOrchestratorEvent?.((event: OrchEvent) => {
      setEvents(prev => [...prev, event])
      if (event.result) setResults(prev => new Map(prev).set(event.subAgentId!, event.result!))
    })
    return cleanup
  }, [running])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [events])

  const handlePlan = useCallback(async () => {
    if (!task || !workspaceRoot) return
    setPlanning(true)
    const settings = await (window as any).api.settingsGet()
    const provider = settings.defaultProvider || 'anthropic'
    const model = settings.defaultModel || 'claude-sonnet-4-20250514'
    const p = await (window as any).api.orchestratorPlan({ task, workspaceRoot, provider, model })
    setPlan(p)
    setPlanning(false)
  }, [task, workspaceRoot])

  const handleExecute = useCallback(async () => {
    if (!plan) return
    setRunning(true)
    setEvents([])
    setResults(new Map())
    const settings = await (window as any).api.settingsGet()
    const provider = settings.defaultProvider || 'anthropic'
    const model = settings.defaultModel || 'claude-sonnet-4-20250514'
    await (window as any).api.orchestratorExecute({ plan, workspaceRoot, provider, model })
  }, [plan, workspaceRoot])

  const statusIcon = (status: string) => {
    switch (status) {
      case 'done': return <CheckCircle size={14} color="#3fb950" />
      case 'error': return <XCircle size={14} color="#f85149" />
      case 'skipped': return <SkipForward size={14} color="#8b949e" />
      case 'running': return <Loader2 size={14} className="animate-spin" />
      default: return <Clock size={14} color="#8b949e" />
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0d1117' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #21262d', display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Orchestrator</span>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {/* Task input */}
        <textarea value={task} onChange={e => setTask(e.target.value)} rows={3} placeholder="Describe the tasks for parallel agents..." style={{ width: '100%', padding: 8, fontSize: 12, backgroundColor: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, outline: 'none', resize: 'none', fontFamily: 'inherit' }} />

        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button onClick={handlePlan} disabled={planning || !task} style={{ padding: '4px 16px', backgroundColor: '#238636', color: '#fff', border: 'none', borderRadius: 6, cursor: planning ? 'wait' : 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>{planning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} Generate Plan</button>
          {plan && !running && <button onClick={handleExecute} style={{ padding: '4px 16px', backgroundColor: '#1f6feb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}><Play size={12} /> Execute</button>}
        </div>

        {/* Plan visualization */}
        {plan && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>Plan: {plan.subAgents?.length || 0} sub-agents</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {plan.subAgents?.map((sa: any) => {
                const result = results.get(sa.id)
                const status = result?.status || 'pending'
                return (
                  <div key={sa.id} style={{ padding: 12, backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: 8, minWidth: 180, maxWidth: 250 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      {statusIcon(status)}
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#f0f6fc' }}>{sa.role}</span>
                      <span style={{ fontSize: 10, color: '#8b949e', marginLeft: 'auto' }}>{sa.priority}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#c9d1d9', marginBottom: 6 }}>{sa.task}</div>
                    {sa.dependsOn?.length > 0 && <div style={{ fontSize: 10, color: '#8b949e' }}>deps: {sa.dependsOn.join(', ')}</div>}
                    {result?.durationMs && <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>{(result.durationMs / 1000).toFixed(1)}s</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Event log */}
        {events.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 11, color: '#8b949e', marginBottom: 4 }}>Event Log</div>
            {events.map((ev, i) => (
              <div key={i} style={{ fontSize: 11, padding: '2px 0', color: ev.type.includes('error') ? '#f85149' : ev.type.includes('done') ? '#3fb950' : '#8b949e' }}>
                {ev.type}: {ev.subAgentId || ''} {ev.error || ''}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </div>
  )
}
