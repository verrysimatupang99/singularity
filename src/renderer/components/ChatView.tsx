import { useState, useRef, useEffect, useCallback } from 'react'
import { ChatMessage, Session, ToolCall } from '../types'
import MessageBubble from './MessageBubble'

interface ChatViewProps {
  session: Session | null
  messages: ChatMessage[]
  onSendMessage: (content: string) => void
  onSaveMessages: (messages: ChatMessage[]) => void
  isLoading: boolean
  onCancel: () => void
  streamingContent: string | null
  activeToolCalls: ToolCall[]
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
}: ChatViewProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isLoading) return
    onSendMessage(trimmed)
    setInput('')
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

  // Save messages when they change
  useEffect(() => {
    if (session && messages.length > 0) {
      onSaveMessages(messages)
    }
  }, [messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Empty state
  if (!session) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0d1117',
          color: '#484f58',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div style={{ fontSize: '3rem', opacity: 0.3 }}>&#9889;</div>
        <div style={{ fontSize: '1.1rem' }}>
          Select a session or create a new one
        </div>
      </div>
    )
  }

  // Build display messages (merge streaming content if active)
  const displayMessages = [...messages]
  if (streamingContent && isLoading) {
    const streamingMsg: ChatMessage = {
      id: 'streaming',
      role: 'assistant',
      content: streamingContent,
      timestamp: Date.now(),
    }
    displayMessages.push(streamingMsg)
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#0d1117',
        minWidth: 0,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 20px',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: '#161b22',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: '0.95rem',
              fontWeight: 600,
              color: '#c9d1d9',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {session.name}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8b949e' }}>
            {session.provider} / {session.model}
          </div>
        </div>
        {isLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: '#f0883e',
                animation: 'pulse 1s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: '0.8rem', color: '#f0883e' }}>
              Thinking...
            </span>
            <button
              onClick={onCancel}
              style={{
                backgroundColor: '#21262d',
                border: '1px solid #30363d',
                color: '#c9d1d9',
                padding: '4px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              Stop
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
        }}
      >
        {displayMessages.map((msg, idx) => {
          // Show inline tool call indicators before assistant messages when tools are active
          const activeCalls = activeToolCalls.filter((t) => t.status === 'executing' || t.status === 'pending')
          const showToolIndicator = msg.role === 'assistant' && activeCalls.length > 0 && idx > 0 && displayMessages[idx - 1]?.role === 'user'

          return (
            <div key={msg.id}>
              {showToolIndicator && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    marginBottom: '8px',
                    padding: '8px 12px',
                    backgroundColor: '#161b22',
                    border: '1px solid #30363d',
                    borderRadius: '8px',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#8b949e', fontWeight: 600 }}>
                    Tools:
                  </span>
                  {activeCalls.map((tc) => (
                    <span
                      key={tc.id}
                      style={{
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        backgroundColor: tc.status === 'executing'
                          ? 'rgba(88, 166, 255, 0.15)'
                          : 'rgba(210, 153, 34, 0.15)',
                        color: tc.status === 'executing' ? '#58a6ff' : '#d29922',
                        border: `1px solid ${tc.status === 'executing' ? 'rgba(88, 166, 255, 0.3)' : 'rgba(210, 153, 34, 0.3)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span style={{ fontSize: '0.7rem' }}>
                        {tc.status === 'executing' ? '\uD83D\uDD04' : '\u23F3'}
                      </span>
                      {tc.name}
                    </span>
                  ))}
                </div>
              )}
              <MessageBubble
                content={msg.content}
                role={msg.role}
                timestamp={msg.timestamp}
              />
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid #21262d',
          backgroundColor: '#161b22',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '8px',
            alignItems: 'flex-end',
            backgroundColor: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '12px',
            padding: '8px 12px',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Shift+Enter for new line)"
            rows={1}
            disabled={isLoading}
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              color: '#c9d1d9',
              fontSize: '0.9rem',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              maxHeight: '200px',
              lineHeight: 1.5,
            }}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            style={{
              backgroundColor: input.trim() && !isLoading ? '#238636' : '#21262d',
              border: 'none',
              borderRadius: '8px',
              color: input.trim() && !isLoading ? '#fff' : '#484f58',
              padding: '8px 16px',
              cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
              fontSize: '0.85rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap',
            }}
          >
            <SendIcon />
            Send
          </button>
        </div>
      </div>

      {/* Keyframe animation for pulse */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <path d="M.989 8 .064 1.58a1.45 1.45 0 0 1 2.04-1.483L14.492 4.82a1.275 1.275 0 0 1 0 2.36L2.104 11.903a1.45 1.45 0 0 1-2.04-1.482L.99 8Zm.961-.162 1.472 1.472a.25.25 0 0 0 .434-.162l.63-5.06a.25.25 0 0 0-.395-.236L1.573 5.68a.25.25 0 0 0 .013.434L3.95 7.838Z" />
    </svg>
  )
}
