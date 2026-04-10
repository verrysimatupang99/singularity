import { useState, useCallback, useEffect, useRef } from 'react'
import { X, Check, ExternalLink } from 'lucide-react'
import { marked } from 'marked'

interface InlineChatProps {
  filePath: string
  selectedText?: string
  fileContent: string
  provider: string
  model: string
  onApplyDiff: (diff: string) => void
  onViewFullDiff: (diff: string) => void
  onClose: () => void
  theme: string
}

export default function InlineChat({
  filePath, selectedText, fileContent, provider, model,
  onApplyDiff, onViewFullDiff, onClose, theme,
}: InlineChatProps) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [loading, setLoading] = useState(false)
  const [responseDiff, setResponseDiff] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = useCallback(async () => {
    if (!input.trim() || loading) return
    const userMsg = input.trim()
    setInput('')
    setLoading(true)
    setResponseDiff(null)

    const contextMsg = selectedText
      ? `File: ${filePath}\n\nSelected code:\n\`\`\`\n${selectedText}\n\`\`\`\n\nFull file context is available. ${userMsg}`
      : `File: ${filePath}\n\nFile content:\n\`\`\`\n${fileContent.slice(0, 8000)}\n\`\`\`\n\n${userMsg}`

    setMessages(prev => [...prev, { role: 'user', content: userMsg }])

    try {
      const requestId = await window.api.chatSend(provider, model, [
        {
          id: 'inline_system',
          role: 'system',
          content: `You are a code assistant. The user is editing ${filePath.split('/').at(-1)}.
When asked to modify code, respond with code blocks containing the MODIFIED code only.
If the user wants changes to the file, output the complete modified file content in a code block.
Always be concise. Include the full file path as a comment in the code block.`,
          timestamp: Date.now(),
        },
        {
          id: 'inline_user',
          role: 'user',
          content: contextMsg,
          timestamp: Date.now(),
        },
      ])

      const cleanup = window.api.onChatChunk((data) => {
        if (data.requestId === requestId) {
          if (data.done) {
            setLoading(false)
            const aiContent = data.content
            setMessages(prev => [...prev, { role: 'assistant', content: aiContent }])

            const codeBlockMatch = aiContent.match(/```[\w]*\n([\s\S]*?)```/)
            if (codeBlockMatch) {
              const codeBlock = codeBlockMatch[1]
              window.api.aiGenerateDiff(filePath, codeBlock).then(result => {
                if (result.success && result.diff) {
                  setResponseDiff(result.diff)
                }
              })
            }
            cleanup()
          }
        }
      })
    } catch (err) {
      setLoading(false)
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : String(err)}` }])
    }
  }, [input, loading, provider, model, filePath, selectedText, fileContent])

  const handleApplyDiff = useCallback(() => {
    if (responseDiff) {
      onApplyDiff(responseDiff)
    }
  }, [responseDiff, onApplyDiff])

  const fileName = filePath.split('/').at(-1) || filePath

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 100,
      display: 'flex', flexDirection: 'column',
      backgroundColor: theme === 'light' ? '#ffffff' : '#0d1117',
      borderLeft: '1px solid #21262d',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', padding: '8px 12px',
        borderBottom: '1px solid #21262d', gap: 8,
        backgroundColor: theme === 'light' ? '#f6f8fa' : '#161b22',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>AI: {fileName}</span>
        <span style={{ fontSize: 11, color: '#8b949e' }}>({model})</span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 2,
        }}>
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{
            marginBottom: 12,
            padding: '8px 12px',
            borderRadius: 8,
            backgroundColor: msg.role === 'user'
              ? (theme === 'light' ? '#ddf4ff' : 'rgba(56,139,253,0.1)')
              : (theme === 'light' ? '#f6f8fa' : '#161b22'),
          }}>
            <div style={{ fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {msg.role === 'assistant' ? (
                <div dangerouslySetInnerHTML={{ __html: marked(msg.content) }} />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ padding: 8, color: '#8b949e', fontSize: 12 }}>Thinking...</div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Diff action bar */}
      {responseDiff && (
        <div style={{
          padding: '8px 12px', borderTop: '1px solid #21262d',
          display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap',
          backgroundColor: theme === 'light' ? '#f6f8fa' : '#161b22',
        }}>
          <button onClick={handleApplyDiff} style={{
            padding: '4px 12px', backgroundColor: '#238636', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Check size={12} /> Apply as Diff
          </button>
          <button onClick={() => onViewFullDiff(responseDiff)} style={{
            padding: '4px 12px', backgroundColor: 'transparent', color: '#58a6ff',
            border: '1px solid #30363d', borderRadius: 6, cursor: 'pointer', fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <ExternalLink size={12} /> View Full Diff
          </button>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: 8, borderTop: '1px solid #21262d',
        display: 'flex', gap: 6,
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          placeholder={selectedText ? 'Ask about selection...' : 'Ask about this file...'}
          rows={2}
          style={{
            flex: 1, padding: '6px 10px', fontSize: 13,
            backgroundColor: theme === 'light' ? '#fff' : '#0d1117',
            color: '#c9d1d9', border: '1px solid #30363d',
            borderRadius: 6, outline: 'none', resize: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            padding: '6px 14px', backgroundColor: '#238636', color: '#fff',
            border: 'none', borderRadius: 6, cursor: loading ? 'wait' : 'pointer',
            fontSize: 13, alignSelf: 'flex-end',
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
