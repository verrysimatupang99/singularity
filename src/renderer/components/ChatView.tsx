import { useState, useRef, useEffect, useCallback } from 'react'
import { ChatMessage, Session, ToolCall, Attachment, McpServerInfo } from '../types'
import MessageBubble from './MessageBubble'

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

export default function ChatView({
  session,
  messages,
  onSendMessage,
  onSaveMessages,
  isLoading,
  onCancel,
  streamingContent,
  activeToolCalls,
  onExportSuccess,
  initialMessage,
  onMessageSent,
  contextWindow,
  onCompress,
}: ChatViewProps) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [exportMenu, setExportMenu] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([])
  const [mcpExpanded, setMcpExpanded] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const parentRef = useRef<HTMLDivElement>(null)
  const mcpIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Build display messages (merge streaming content if active)
  const displayMessages = [...messages]
  if (streamingContent && isLoading) {
    const streamingMsg: ChatMessage = {
      id: `streaming_${Date.now()}`,
      role: 'assistant',
      content: streamingContent,
      timestamp: Date.now(),
    }
    displayMessages.push(streamingMsg)
  }

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingContent, scrollToBottom])

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  // Load MCP servers
  useEffect(() => {
    const loadMcp = async () => {
      try {
        const list = await window.api.mcpList()
        setMcpServers(list)
      } catch {}
    }
    loadMcp()
    mcpIntervalRef.current = setInterval(loadMcp, 10000)
    return () => { if (mcpIntervalRef.current) clearInterval(mcpIntervalRef.current) }
  }, [])

  // Pre-fill input from initialMessage
  useEffect(() => {
    if (initialMessage) {
      setInput(initialMessage)
    }
  }, [initialMessage])

  const handlePickFiles = async () => {
    try {
      const filePaths = await window.api.filePick()
      if (!filePaths || filePaths.length === 0) return
      const newAttachments: Attachment[] = []
      for (const fp of filePaths) {
        try {
          const fileData = await window.api.fileRead(fp)
          newAttachments.push({
            id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: fileData.name,
            type: fileData.type,
            mimeType: fileData.mimeType,
            content: fileData.content,
            size: fileData.size,
          })
        } catch (err) {
          console.error(`Failed to read file ${fp}:`, err)
        }
      }
      setAttachments((prev) => [...prev, ...newAttachments])
    } catch (err) {
      console.error('Failed to pick files:', err)
    }
  }

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
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
    } catch (err) {
      console.error('Export failed:', err)
      setToast('Export failed')
      setTimeout(() => setToast(null), 4000)
    }
  }

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed && attachments.length === 0) return
    if (isLoading) return
    onSendMessage(trimmed || '(attachment)', attachments.length > 0 ? attachments : undefined)
    setInput('')
    setAttachments([])
    onMessageSent?.()
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Save messages when they change (debounced)
  useEffect(() => {
    if (session && messages.length > 0) {
      const timer = setTimeout(() => { onSaveMessages(messages) }, 2000)
      return () => clearTimeout(timer)
    }
  }, [messages, session])

  // Compute context usage
  const totalTokens = displayMessages.reduce((sum, m) => sum + (m.tokenUsage?.totalTokens || 0), 0)
  const contextPct = contextWindow && contextWindow > 0 ? Math.min((totalTokens / contextWindow) * 100, 100) : 0
  const contextColor = contextPct >= 90 ? '#f85149' : contextPct >= 70 ? '#d29922' : '#3fb950'

  // Provider name for header
  const providerName = session?.provider ? session.provider.charAt(0).toUpperCase() + session.provider.slice(1) : 'Unknown'
  const modelName = session?.model || 'Unknown'

  // Empty state — Glasswing empty state with serif typography
  if (!session) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--surface)',
          color: 'var(--on-surface-variant)',
          flexDirection: 'column',
          gap: 16,
          position: 'relative',
        }}
      >
        {/* Empty state brand moment */}
        <div style={{ position: 'absolute', bottom: 48, right: 48, pointerEvents: 'none', opacity: 0.05 }}>
          <h1 style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: '8rem', letterSpacing: '-0.02em' }}>
            Singularity
          </h1>
        </div>

        <div style={{ fontSize: 48, opacity: 0.2 }}>∞</div>
        <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--on-surface)' }}>
          Select a session or create a new one
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--surface-container-low)',
        overflow: 'hidden',
      }}
    >
      {/* Chat Header with Context Meter */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(62, 73, 74, 0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Status dot with glow */}
            <div style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: 'var(--primary)',
              boxShadow: '0 0 8px rgba(114, 214, 222, 0.6)',
            }} />
            <h3 style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: 'var(--on-surface)',
              margin: 0,
            }}>
              {providerName} — {modelName}
            </h3>
          </div>

          {/* Export menu button */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setExportMenu(!exportMenu)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--on-surface-variant)',
                cursor: 'pointer',
                fontSize: 18,
                opacity: 0.4,
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
            >
              ⋮
            </button>
            {exportMenu && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                zIndex: 1001,
                backgroundColor: 'var(--surface-container-high)',
                border: '1px solid rgba(62, 73, 74, 0.1)',
                borderRadius: 4,
                padding: '4px 0',
                minWidth: 150,
              }}>
                <button
                  onClick={() => handleExport('markdown')}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 16px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--on-surface)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-container-highest)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Export as Markdown
                </button>
                <button
                  onClick={() => handleExport('json')}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 16px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--on-surface)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-container-highest)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}
                >
                  Export as JSON
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Context Meter */}
        {contextWindow && totalTokens > 0 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '-0.02em', opacity: 0.6, marginBottom: 6 }}>
              <span>Context Tokens</span>
              <span style={{ color: contextColor }}>{Math.round(contextPct)}% utilized</span>
            </div>
            <div style={{ height: 4, width: '100%', backgroundColor: 'var(--surface-container-highest)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${contextPct}%`, backgroundColor: contextColor, boxShadow: `0 0 4px ${contextColor}66`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Toast notification */}
      {toast && (
        <div style={{
          padding: '8px 16px',
          backgroundColor: 'rgba(63, 168, 176, 0.15)',
          borderBottom: '1px solid rgba(62, 73, 74, 0.1)',
          fontSize: 12,
          color: 'var(--primary)',
        }}>
          {toast}
        </div>
      )}

      {/* Messages */}
      <div
        ref={parentRef}
        style={{ flex: 1, overflowY: 'auto', padding: 16 }}
      >
        {displayMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            tokenUsage={msg.tokenUsage}
            model={modelName}
          />
        ))}

        {displayMessages.length === 0 && !streamingContent && (
          <div style={{
            textAlign: 'center',
            color: 'var(--on-surface-variant)',
            opacity: 0.4,
            padding: 48,
            fontSize: 13,
          }}>
            No messages yet. Start the conversation.
          </div>
        )}

        {/* Loading indicator */}
        {isLoading && !streamingContent && (
          <div style={{
            textAlign: 'center',
            color: 'var(--primary)',
            padding: 24,
            fontSize: 13,
            opacity: 0.6,
          }}>
            Thinking...
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div style={{ padding: '8px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {attachments.map(att => (
            <div
              key={att.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 8px',
                backgroundColor: 'var(--surface-container)',
                borderRadius: 4,
                fontSize: 11,
                color: 'var(--on-surface-variant)',
              }}
            >
              <span>📎 {att.name}</span>
              <span style={{ opacity: 0.6 }}>{(att.size / 1024).toFixed(1)}KB</span>
              <button
                onClick={() => handleRemoveAttachment(att.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--on-surface-variant)',
                  cursor: 'pointer',
                  fontSize: 14,
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Area */}
      <div style={{ padding: 16, borderTop: '1px solid rgba(62, 73, 74, 0.1)' }}>
        <div style={{
          backgroundColor: 'var(--surface-lowest)',
          padding: 12,
          borderRadius: 4,
          border: '1px solid rgba(62, 73, 74, 0.2)',
          transition: 'border-color 0.15s',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${session.name || 'your project'}...`}
            rows={2}
            style={{
              width: '100%',
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--on-surface)',
              fontSize: 13,
              resize: 'none',
              minHeight: 40,
              maxHeight: 200,
              fontFamily: 'inherit',
            }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handlePickFiles}
                title="Attach file"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--on-surface-variant)',
                  cursor: 'pointer',
                  fontSize: 16,
                  opacity: 0.4,
                  padding: 2,
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.4'}
              >
                📎
              </button>
            </div>

            {/* Send button — Lithium gradient */}
            <button
              onClick={handleSend}
              disabled={isLoading || (!input.trim() && attachments.length === 0)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                background: isLoading
                  ? 'var(--surface-container-highest)'
                  : 'linear-gradient(135deg, var(--primary-container) 0%, var(--primary) 100%)',
                color: isLoading ? 'var(--on-surface-variant)' : 'var(--on-primary-fixed)',
                border: 'none',
                borderRadius: 2,
                cursor: isLoading ? 'wait' : (input.trim() || attachments.length > 0) ? 'pointer' : 'not-allowed',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                opacity: isLoading || (input.trim() || attachments.length > 0) ? 1 : 0.5,
                transition: 'transform 0.1s, opacity 0.15s',
                boxShadow: '0 4px 12px rgba(114, 214, 222, 0.2)',
              }}
              onMouseEnter={e => { if (!isLoading && (input.trim() || attachments.length > 0)) e.currentTarget.style.transform = 'scale(1.02)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {isLoading ? 'Generating...' : 'Send'}
              {!isLoading && <span style={{ fontSize: 14 }}>→</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
