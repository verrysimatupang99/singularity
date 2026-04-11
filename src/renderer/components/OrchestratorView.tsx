import { useState, useCallback, useEffect, useRef } from 'react'
import { Play, Loader2, CheckCircle, XCircle, SkipForward, Clock, Square, ArrowRight, Plus, Trash2, Settings2 } from 'lucide-react'
import { useLayout } from '../context/LayoutContext'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SubAgentSpec {
  id: string
  role: string
  task: string
  tools: string[]
  dependsOn: string[]
  priority: 'high' | 'normal' | 'low'
}

interface SubAgentResult {
  id: string; role: string; status: string; output: string; filesModified: string[]; error?: string; durationMs: number
}

interface OrchEvent {
  orchestratorId: string
  type: string
  subAgentId?: string
  subAgent?: SubAgentSpec
  result?: SubAgentResult
  error?: string
  summary?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function PulsingDot({ color }: { color: string }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: 8, height: 8 }}>
      <span style={{
        position: 'absolute', width: '100%', height: '100%', borderRadius: '50%',
        backgroundColor: color, opacity: 0.6,
        animation: 'pulse 1.5s ease-in-out infinite',
      }} />
      <span style={{ position: 'relative', width: 8, height: 8, borderRadius: '50%', backgroundColor: color }} />
    </span>
  )
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'done': return <CheckCircle size={14} color="#3fb950" />
    case 'error': return <XCircle size={14} color="#f85149" />
    case 'skipped': return <SkipForward size={14} color="#8b949e" />
    case 'running': return <PulsingDot color="#f0883e" />
    default: return <Clock size={14} color="#8b949e" />
  }
}

const BUILT_IN_TOOLS = ['read_file', 'write_file', 'run_terminal', 'list_files', 'search_in_files', 'remember', 'recall', 'forget', 'take_screenshot', 'mcp_call']

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrchestratorView() {
  const { workspaceRoot } = useLayout()
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')

  // Auto mode
  const [task, setTask] = useState('')
  const [plan, setPlan] = useState<any>(null)
  const [planning, setPlanning] = useState(false)

  // Manual mode
  const [manualAgents, setManualAgents] = useState<SubAgentSpec[]>([])

  // Shared
  const [running, setRunning] = useState(false)
  const [events, setEvents] = useState<OrchEvent[]>([])
  const [results, setResults] = useState<Map<string, SubAgentResult>>(new Map())
  const [orchestratorStatus, setOrchestratorStatus] = useState<{ active: boolean; orchestrators: any[] }>({ active: false, orchestrators: [] })
  const [logExpanded, setLogExpanded] = useState<Set<number>>(new Set())
  const endRef = useRef<HTMLDivElement>(null)

  // Poll orchestrator status
  useEffect(() => {
    if (!running) return
    const poll = () => window.api.orchestratorStatus?.().then(setOrchestratorStatus).catch(() => {})
    poll()
    const interval = setInterval(poll, 2000)
    return () => clearInterval(interval)
  }, [running])

  // Event listener
  useEffect(() => {
    if (!running) return
    const cleanup = (window as any).api?.onOrchestratorEvent?.((event: OrchEvent) => {
      setEvents(prev => [...prev, event])
      if (event.result) setResults(prev => new Map(prev).set(event.subAgentId!, event.result!))
      if (event.type === 'done' || event.type === 'error') setRunning(false)
    })
    return cleanup
  }, [running])

  // Auto-scroll log
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [events])

  // --- Auto mode handlers ---

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

  const handleExecutePlan = useCallback(async () => {
    if (!plan) return
    setRunning(true); setEvents([]); setResults(new Map())
    const settings = await (window as any).api.settingsGet()
    const provider = settings.defaultProvider || 'anthropic'
    const model = settings.defaultModel || 'claude-sonnet-4-20250514'
    await (window as any).api.orchestratorExecute({ plan, workspaceRoot, provider, model })
  }, [plan, workspaceRoot])

  // --- Manual mode handlers ---

  const addManualAgent = useCallback(() => {
    const id = `agent_${manualAgents.length}`
    setManualAgents(prev => [...prev, { id, role: '', task: '', tools: ['read_file', 'write_file'], dependsOn: [], priority: 'normal' as const }])
  }, [manualAgents.length])

  const updateManualAgent = useCallback((index: number, updates: Partial<SubAgentSpec>) => {
    setManualAgents(prev => prev.map((a, i) => i === index ? { ...a, ...updates } : a))
  }, [])

  const removeManualAgent = useCallback((index: number) => {
    setManualAgents(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleExecuteManual = useCallback(async () => {
    if (manualAgents.length === 0 || !workspaceRoot) return
    const plan = {
      orchestratorId: `orch_${Date.now()}`,
      task: `Manual execution: ${manualAgents.length} agents`,
      subAgents: manualAgents,
      strategy: 'dag' as const,
      estimatedTokens: manualAgents.length * 5000,
    }
    setRunning(true); setEvents([]); setResults(new Map())
    const settings = await (window as any).api.settingsGet()
    const provider = settings.defaultProvider || 'anthropic'
    const model = settings.defaultModel || 'claude-sonnet-4-20250514'
    await (window as any).api.orchestratorExecute({ plan, workspaceRoot, provider, model })
  }, [manualAgents, workspaceRoot])

  // --- Cancel ---

  const handleCancelAll = useCallback(async () => {
    if (plan?.orchestratorId) await (window as any).api.orchestratorCancel(plan.orchestratorId)
    setRunning(false)
  }, [plan])

  // --- Render helpers ---

  const getAgentStatus = useCallback((sa: SubAgentSpec) => {
    const result = results.get(sa.id)
    if (result) return result.status
    if (running) return 'running'
    return 'pending'
  }, [results, running])

  const toggleLog = useCallback((idx: number) => {
    setLogExpanded(prev => { const next = new Set(prev); if (next.has(idx)) next.delete(idx); else next.add(idx); return next })
  }, [])

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0d1117' }}>
      <style>{`@keyframes pulse { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.8); opacity: 0; } }`}</style>

      {/* Header */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #21262d', display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Orchestrator</span>
          {/* Mode toggle */}
          <div style={{ display: 'flex', backgroundColor: '#161b22', borderRadius: 4, border: '1px solid #30363d', overflow: 'hidden' }}>
            <button onClick={() => setMode('auto')} style={{
              padding: '2px 10px', fontSize: 11, border: 'none', cursor: 'pointer',
              backgroundColor: mode === 'auto' ? '#1f6feb' : 'transparent',
              color: mode === 'auto' ? '#fff' : '#8b949e',
            }}>Auto</button>
            <button onClick={() => setMode('manual')} style={{
              padding: '2px 10px', fontSize: 11, border: 'none', cursor: 'pointer',
              backgroundColor: mode === 'manual' ? '#1f6feb' : 'transparent',
              color: mode === 'manual' ? '#fff' : '#8b949e',
            }}>Manual</button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {orchestratorStatus.active && (
            <>
              <PulsingDot color="#f0883e" />
              <span style={{ fontSize: 11, color: '#f0883e' }}>{orchestratorStatus.orchestrators.length} active</span>
            </>
          )}
          {running && (
            <button onClick={handleCancelAll} style={{
              padding: '2px 8px', backgroundColor: 'transparent', color: '#f85149',
              border: '1px solid #f85149', borderRadius: 4, cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <Square size={10} /> Cancel
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {/* ---- AUTO MODE ---- */}
        {mode === 'auto' && (
          <>
            <textarea value={task} onChange={e => setTask(e.target.value)} rows={3}
              placeholder="Describe the tasks for parallel agents (e.g. 'Create a landing page with hero section, features grid, and footer')"
              style={{ width: '100%', padding: 8, fontSize: 12, backgroundColor: '#161b22', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 6, outline: 'none', resize: 'none', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={handlePlan} disabled={planning || !task} style={{
                padding: '4px 16px', backgroundColor: planning ? '#21262d' : '#238636', color: '#fff',
                border: 'none', borderRadius: 6, cursor: planning ? 'wait' : 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
              }}>
                {planning ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                {planning ? 'Planning...' : 'Generate Plan'}
              </button>
              {plan && !running && (
                <button onClick={handleExecutePlan} style={{
                  padding: '4px 16px', backgroundColor: '#1f6feb', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Play size={12} /> Execute
                </button>
              )}
            </div>
          </>
        )}

        {/* ---- MANUAL MODE ---- */}
        {mode === 'manual' && (
          <>
            {manualAgents.map((agent, i) => (
              <div key={agent.id} style={{ padding: 12, backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#f0f6fc' }}>Agent {i + 1}</span>
                  <button onClick={() => removeManualAgent(i)} style={{ background: 'none', border: 'none', color: '#f85149', cursor: 'pointer', padding: 2 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input value={agent.role} onChange={e => updateManualAgent(i, { role: e.target.value })}
                    placeholder="Role (e.g. frontend, backend)" style={{ flex: 1, padding: '4px 8px', fontSize: 11, backgroundColor: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4 }} />
                  <select value={agent.priority} onChange={e => updateManualAgent(i, { priority: e.target.value as any })}
                    style={{ padding: '4px 8px', fontSize: 11, backgroundColor: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4 }}>
                    <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
                  </select>
                </div>
                <input value={agent.task} onChange={e => updateManualAgent(i, { task: e.target.value })}
                  placeholder="Task description" style={{ width: '100%', padding: '4px 8px', fontSize: 11, backgroundColor: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d', borderRadius: 4, marginBottom: 8 }} />
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {BUILT_IN_TOOLS.map(tool => (
                    <button key={tool} onClick={() => {
                      const tools = agent.tools.includes(tool) ? agent.tools.filter(t => t !== tool) : [...agent.tools, tool]
                      updateManualAgent(i, { tools })
                    }} style={{
                      padding: '2px 6px', fontSize: 10, borderRadius: 3, cursor: 'pointer',
                      backgroundColor: agent.tools.includes(tool) ? '#1f6feb' : '#0d1117',
                      color: agent.tools.includes(tool) ? '#fff' : '#8b949e',
                      border: '1px solid #30363d',
                    }}>
                      {tool}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={addManualAgent} style={{
                padding: '4px 12px', backgroundColor: '#21262d', color: '#c9d1d9',
                border: '1px solid #30363d', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
              }}>
                <Plus size={12} /> Add Agent
              </button>
              {manualAgents.length > 0 && !running && (
                <button onClick={handleExecuteManual} style={{
                  padding: '4px 16px', backgroundColor: '#238636', color: '#fff',
                  border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                }}>
                  <Play size={12} /> Execute All
                </button>
              )}
            </div>
          </>
        )}

        {/* ---- PLAN VISUALIZATION ---- */}
        {plan && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 8 }}>
              Plan: {plan.subAgents?.length || 0} sub-agents (DAG strategy)
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(plan.subAgents || manualAgents).map((sa: SubAgentSpec) => {
                const status = getAgentStatus(sa)
                const result = results.get(sa.id)
                return (
                  <div key={sa.id} style={{
                    padding: 12, backgroundColor: '#161b22', border: '1px solid #30363d',
                    borderRadius: 8, minWidth: 180, maxWidth: 250,
                    borderColor: status === 'done' ? '#23863640' : status === 'error' ? '#f8514940' : '#30363d',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <StatusIcon status={status} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#f0f6fc' }}>{sa.role || 'Unnamed'}</span>
                      <span style={{ fontSize: 10, color: '#8b949e', marginLeft: 'auto' }}>{sa.priority}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#c9d1d9', marginBottom: 6 }}>{sa.task}</div>
                    {sa.dependsOn?.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                        {sa.dependsOn.map(dep => (
                          <span key={dep} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: '#8b949e' }}>
                            <ArrowRight size={10} color="#484f58" />{dep}
                          </span>
                        ))}
                      </div>
                    )}
                    {result?.durationMs && <div style={{ fontSize: 10, color: '#8b949e', marginTop: 4 }}>{(result.durationMs / 1000).toFixed(1)}s · {result.filesModified.length} files</div>}
                    {status === 'running' && <div style={{ fontSize: 10, color: '#f0883e', marginTop: 4 }}>Running...</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ---- REAL-TIME EVENT LOG ---- */}
        {events.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#8b949e' }}>
                Real-Time Log ({events.length} events)
              </span>
              <button onClick={() => setLogExpanded(events.map((_, i) => i).reduce((acc, i) => acc.add(i), new Set<number>()))}
                style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', fontSize: 10 }}>
                Expand All
              </button>
            </div>
            <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: 6, padding: 8, maxHeight: 240, overflowY: 'auto' }}>
              {events.map((ev, i) => {
                const isExpanded = logExpanded.has(i)
                const isError = ev.type.includes('error')
                const isDone = ev.type.includes('done')
                return (
                  <div key={i} style={{
                    borderBottom: i < events.length - 1 ? '1px solid #21262d' : 'none',
                    padding: '4px 0',
                    cursor: 'pointer',
                  }}
                    onClick={() => toggleLog(i)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                      {isError ? <XCircle size={10} color="#f85149" /> : isDone ? <CheckCircle size={10} color="#3fb950" /> : <Clock size={10} color="#8b949e" />}
                      <span style={{ color: isError ? '#f85149' : isDone ? '#3fb950' : '#8b949e', fontFamily: 'monospace' }}>
                        [{ev.type}]
                      </span>
                      <span style={{ color: '#c9d1d9' }}>{ev.subAgentId || ''}</span>
                      <span style={{ color: '#484f58', marginLeft: 'auto', fontSize: 10 }}>
                        #{i}
                      </span>
                    </div>
                    {isExpanded && ev.error && (
                      <div style={{ marginTop: 4, padding: 4, backgroundColor: '#0d1117', borderRadius: 3, fontSize: 10, color: '#f85149', fontFamily: 'monospace' }}>
                        {ev.error}
                      </div>
                    )}
                    {isExpanded && ev.summary && (
                      <div style={{ marginTop: 4, fontSize: 10, color: '#c9d1d9' }}>
                        {ev.summary}
                      </div>
                    )}
                    {isExpanded && ev.result && (
                      <div style={{ marginTop: 4, padding: 4, backgroundColor: '#0d1117', borderRadius: 3, fontSize: 10, color: '#8b949e', fontFamily: 'monospace' }}>
                        {(ev.result.durationMs / 1000).toFixed(1)}s · {ev.result.filesModified.length} files modified
                        {ev.result.error && <span style={{ color: '#f85149' }}> · Error: {ev.result.error}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
