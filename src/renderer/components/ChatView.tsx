import { useState, useRef, useEffect, useCallback } from 'react'
import { ChatMessage, Session, ToolCall, Attachment, McpServerInfo } from '../types'
import MessageBubble from './MessageBubble'
import { ChevronDown, ChevronRight, Send, Paperclip, X, Loader2, Download, MoreVertical } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatViewProps {
  session: Session | null
  messages: ChatMessage[]
  onSendMessage: (content: string, attachments?: Attachment[]) => void
  onSaveMessages: (messages: ChatMessage[]) => void
  isLoading: boolean
  onCancel: () => void
  streamingContent: string | null
  activeToolCalls: ToolCall[]
  onExportSuccess?: (path: string) => void
  initialMessage?: string
  onMessageSent?: () => void
  contextWindow?: number
  onCompress?: (strategy: string) => void
}

// ---------------------------------------------------------------------------
// Tool Call Card (OpenCode-style: collapsible, status indicator)
// ---------------------------------------------------------------------------

function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
  const [expanded, setExpanded] = useState(false)

  const statusColor = {
    pending: '#f5a742',
    executing: '#f5a742',
    completed: '#7fd88f',
    failed: '#ffb4ab',
  }[toolCall.status] || '#8b949e'

  const statusLabel = {
    pending: 'Pending',
    executing: 'Running...',
    completed: 'Done',
    failed: 'Failed',
  }[toolCall.status] || toolCall.status

  return (
    <div style={{
      margin: '8px 0',
      backgroundColor: 'var(--surface-container)',
      border: '1px solid var(--outline-variant)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          cursor: 'pointer',
          transition: 'background-color 0.1s',
        }}
        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--surface-container-high)'}
        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
      >
        {expanded ? <ChevronDown size={14} style={{ opacity: 0.5 }} /> : <ChevronRight size={14} style={{ opacity: 0.5 }} />}
        {/* Status dot */}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          backgroundColor: statusColor,
          boxShadow: toolCall.status === 'executing' ? `0 0 6px ${statusColor}66` : 'none',
        }} />
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--on-surface)', fontFamily: 'var(--font-mono)' }}>
          {toolCall.name}
        </span>
        <span style={{ fontSize: 10, color: statusColor, marginLeft: 'auto' }}>
          {statusLabel}
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '0 12px 12px', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
          {toolCall.args && Object.keys(toolCall.args).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Arguments</div>
              <pre style={{
                backgroundColor: 'var(--surface-lowest)', padding: 8, borderRadius: 4,
                color: 'var(--on-surface-variant)', fontSize: 11, overflow: 'auto', maxHeight: 200,
              }}>
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--on-surface-variant)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Result</div>
              <pre style={{
                backgroundColor: 'var(--surface-lowest)', padding: 8, borderRadius: 4,
                color: 'var(--on-surface-variant)', fontSize: 11, overflow: 'auto', maxHeight: 200,
                whiteSpace: 'pre-wrap',
              }}>
                {typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Braille Spinner (Zed-style loading)
// ---------------------------------------------------------------------------

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

function BrailleSpinner() {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setFrame(f => (f + 1) % BRAILLE_FRAMES.length), 100)
    return () => clearInterval(interval)
  }, [])
  return <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--primary)', display: 'inline-block', width: 16 }}>{BRAILLE_FRAMES[frame]}</span>
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ChatView({
  session, messages, onSendMessage, onSaveMessages,
  isLoading, onCancel, streamingContent, activeToolCalls,
  onExportSuccess, initialMessage, onMessageSent, contextWindow,
}: ChatViewProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [exportMenu, setExportMenu] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const parentRef = useRef<HTMLDivElement>(null)
  const mcpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Build display messages
  const displayMessages = [...messages]
  if (streamingContent && isLoading) {
    displayMessages.push({
      id: `streaming_${Date.now()}`,
      role: 'assistant',
      content: streamingContent,
      timestamp: Date.now(),
    })
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, streamingContent, scrollToBottom])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  // Load MCP servers
  useEffect(() => {
    const loadMcp = async () => { try { setMcpServers(await window.api.mcpList()) } catch {} }
    loadMcp()
    mcpIntervalRef.current = setInterval(loadMcp, 10000)
    return () => { if (mcpIntervalRef.current) clearInterval(mcpIntervalRef.current) }
  }, [])

  // Pre-fill input
  useEffect(() => { if (initialMessage) setInput(initialMessage) }, [initialMessage])

  // Save messages (debounced)
  useEffect(() => {
    if (session && messages.length > 0) {
      const timer = setTimeout(() => { onSaveMessages(messages) }, 2000)
      return () => clearTimeout(timer)
    }
  }, [messages, session])

  // --- Handlers ---

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed && attachments.length === 0) return
    if (isLoading) return
    onSendMessage(trimmed || '(attachment)', attachments.length > 0 ? attachments : undefined)
    setInput(''); setAttachments([]); onMessageSent?.()
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handlePickFiles = async () => {
    try {
      const filePaths = await window.api.filePick()
      if (!filePaths?.length) return
      const newAttachments: Attachment[] = []
      for (const fp of filePaths) {
        try {
          const fileData = await window.api.fileRead(fp)
          newAttachments.push({
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: fileData.name, type: fileData.type, mimeType: fileData.mimeType,
            content: fileData.content, size: fileData.size,
          })
        } catch (err) { console.error(`Failed to read file ${fp}:`, err) }
      }
      setAttachments(prev => [...prev, ...newAttachments])
    } catch (err) { console.error('Failed to pick files:', err) }
  }

  const handleExport = async (format: 'markdown' | 'json') => {
    if (!session) return
    setExportMenu(false)
    try {
      const result = await window.api.sessionExport(session.id, format)
      if (result.success && result.filePath) {
        setToast(`Exported: ${result.filePath}`)
        onExportSuccess?.(result.filePath)
        setTimeout(() => setToast(null), 4000)
      }
    } catch (err) { console.error('Export failed:', err); setToast('Export failed'); setTimeout(() => setToast(null), 4000) }
  }

  // --- Computed ---

  const totalTokens = displayMessages.reduce((sum, m) => sum + (m.tokenUsage?.totalTokens || 0), 0)
  const contextPct = contextWindow && contextWindow > 0 ? Math.min((totalTokens / contextWindow) * 100, 100) : 0
  const contextColor = contextPct >= 90 ? 'var(--error)' : contextPct >= 70 ? 'var(--warning)' : 'var(--success)'
  const providerName = session?.provider ? session.provider.charAt(0).toUpperCase() + session.provider.slice(1) : 'Unknown'
  const modelName = session?.model || 'Unknown'

  // --- Empty state ---

  if (!session) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--surface)', color: 'var(--on-surface-variant)', flexDirection: 'column', gap: 16, position: 'relative' }}>
        <div style={{ position: 'absolute', bottom: 48, right: 48, pointerEvents: 'none', opacity: 0.04 }}>
          <h1 style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: '8rem', letterSpacing: '-0.02em', color: 'var(--on-surface)' }}>Singularity</h1>
        </div>
        <div style={{ fontSize: 48, opacity: 0.15 }}>∞</div>
        <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--on-surface)' }}>Select a session or create a new one</div>
      </div>
    )
  }

  // --- Render ---

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: 'var(--surface)', overflow: 'hidden' }}>

      {/* ====== HEADER ====== */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--outline-variant)', backgroundColor: 'var(--surface-low)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Status dot */}
            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--primary)', boxShadow: '0 0 6px rgba(114, 214, 222, 0.5)' }} />
            <span className="label-sm" style={{ color: 'var(--on-surface)' }}>
              {providerName} <span style={{ opacity: 0.5 }}>·</span> {modelName}
            </span>
          </div>

          {/* Export menu */}
          <div style={{ position: 'relative' }}>
            <button onClick={() => setExportMenu(!exportMenu)} className="ghost-btn" style={{ padding: 4, borderRadius: 4, display: 'flex' }}>
              <MoreVertical size={16} />
            </button>
            {exportMenu && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, zIndex: 1001,
                backgroundColor: 'var(--surface-container-high)', border: '1px solid var(--outline-variant)',
                borderRadius: 6, padding: '4px 0', minWidth: 160,
                boxShadow: 'var(--shadow-md)',
              }}>
                {(['markdown', 'json'] as const).map(fmt => (
                  <button key={fmt} onClick={() => handleExport(fmt)} className="ghost-btn" style={{ display: 'block', width: '100%', padding: '8px 16px', textAlign: 'left', fontSize: 12 }}>
                    <Download size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    Export as {fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Context meter */}
        {contextWindow && totalTokens > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--on-surface-variant)', opacity: 0.6, marginBottom: 4 }}>
              <span>Context</span>
              <span style={{ color: contextColor }}>{Math.round(contextPct)}%</span>
            </div>
            <div style={{ height: 3, width: '100%', backgroundColor: 'var(--surface-container-highest)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${contextPct}%`, backgroundColor: contextColor, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{ padding: '8px 16px', backgroundColor: 'var(--primary-container)', borderBottom: '1px solid var(--outline-variant)', fontSize: 12, color: 'var(--on-primary-container)' }}>{toast}</div>
      )}

      {/* ====== MESSAGES ====== */}
      <div ref={parentRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {/* Tool calls */}
        {activeToolCalls.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {activeToolCalls.map(tc => <ToolCallCard key={tc.id} toolCall={tc} />)}
          </div>
        )}

        {/* Messages */}
        {displayMessages.map(msg => (
          <MessageBubble key={msg.id} message={msg} tokenUsage={msg.tokenUsage} model={modelName} />
        ))}

        {/* Loading indicator (Zed braille spinner) */}
        {isLoading && !streamingContent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', color: 'var(--on-surface-variant)', fontSize: 13 }}>
            <BrailleSpinner />
            Thinking...
          </div>
        )}

        {displayMessages.length === 0 && !streamingContent && activeToolCalls.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--on-surface-variant)', opacity: 0.4, padding: 48, fontSize: 13 }}>
            No messages yet. Start the conversation.
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ====== INPUT AREA ====== */}
      <div style={{ padding: '12px 16px 16px', borderTop: '1px solid var(--outline-variant)', backgroundColor: 'var(--surface-low)' }}>
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            {attachments.map(att => (
              <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', backgroundColor: 'var(--surface-container)', borderRadius: 4, fontSize: 11, color: 'var(--on-surface-variant)' }}>
                <span>📎 {att.name}</span>
                <button onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))} className="ghost-btn" style={{ padding: 1, display: 'flex' }}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{
          backgroundColor: 'var(--surface-lowest)',
          padding: 10,
          borderRadius: 8,
          border: '1px solid var(--outline-variant)',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${session.name || 'your project'}...`}
            rows={2}
            style={{
              width: '100%', backgroundColor: 'transparent', border: 'none', outline: 'none',
              color: 'var(--on-surface)', fontSize: 13, resize: 'none', minHeight: 36, maxHeight: 200,
              fontFamily: 'inherit', lineHeight: '1.5',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <button onClick={handlePickFiles} title="Attach file" className="ghost-btn" style={{ padding: 4, borderRadius: 4, display: 'flex', opacity: 0.5 }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>
              <Paperclip size={16} />
            </button>

            {isLoading ? (
              <button onClick={onCancel} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                backgroundColor: 'var(--surface-container-highest)', color: 'var(--on-surface-variant)',
                border: '1px solid var(--outline-variant)', borderRadius: 6,
                cursor: 'pointer', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                <X size={12} /> Stop
              </button>
            ) : (
              <button onClick={handleSend} disabled={!input.trim() && attachments.length === 0}
                className="lithium-gradient"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px',
                  color: 'var(--on-primary-fixed)', border: 'none', borderRadius: 6,
                  cursor: input.trim() || attachments.length > 0 ? 'pointer' : 'not-allowed',
                  fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
                  opacity: input.trim() || attachments.length > 0 ? 1 : 0.4,
                  transition: 'transform 0.1s, opacity 0.15s',
                  boxShadow: '0 2px 8px rgba(114, 214, 222, 0.2)',
                }}
                onMouseEnter={e => { if (input.trim() || attachments.length > 0) e.currentTarget.style.transform = 'scale(1.02)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              >
                Send <Send size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
