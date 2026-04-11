import { ChatMessage } from '../types'
import { useState, useEffect, useCallback } from 'react'
import { marked } from 'marked'

interface MessageBubbleProps {
  message: ChatMessage
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  model?: string
}

export default function MessageBubble({ message, tokenUsage }: MessageBubbleProps) {
  const [copiedCodeIndex, setCopiedCodeIndex] = useState<number | null>(null)
  const [copiedMessage, setCopiedMessage] = useState(false)

  const { content, role, timestamp } = message
  const isUser = role === 'user'
  const isSystem = role === 'system'

  const htmlContent = marked.parse(content, { async: false }) as string

  const copyToClipboard = useCallback(async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedCodeIndex(index)
      setTimeout(() => setCopiedCodeIndex(null), 2000)
    } catch {
      // Clipboard API may not be available
    }
  }, [])

  const copyMessage = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessage(true)
      setTimeout(() => setCopiedMessage(false), 2000)
    } catch {
      // Clipboard API may not be available
    }
  }, [content])

  const timeStr = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  // Extract code blocks for copy buttons
  const codeBlocks = extractCodeBlocks(content)

  const bubbleStyle: React.CSSProperties = {
    maxWidth: '80%',
    padding: '14px 18px',
    borderRadius: '12px',
    marginLeft: isUser ? 'auto' : 0,
    marginRight: isUser ? 0 : 'auto',
    backgroundColor: isSystem
      ? 'rgba(255, 193, 7, 0.1)'
      : isUser
        ? '#1f6feb'
        : '#161b22',
    border: isSystem
      ? '1px solid rgba(255, 193, 7, 0.3)'
      : isUser
        ? '1px solid #388bfd'
        : '1px solid #30363d',
    color: '#c9d1d9',
    lineHeight: 1.6,
    fontSize: '0.9rem',
    position: 'relative',
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        gap: '4px',
        marginBottom: '8px',
      }}
    >
      <div style={bubbleStyle}>
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
        {/* Inline code blocks with copy buttons */}
        {codeBlocks.map((code, index) => (
          <div
            key={index}
            style={{
              marginTop: '8px',
              marginBottom: codeBlocks.length > 1 ? '8px' : 0,
              position: 'relative',
            }}
          >
            <div
              style={{
                backgroundColor: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {code.language && (
                <div
                  style={{
                    padding: '4px 12px',
                    backgroundColor: '#161b22',
                    borderBottom: '1px solid #30363d',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#8b949e' }}>
                    {code.language}
                  </span>
                  <button
                    onClick={() => copyToClipboard(code.text, index)}
                    style={{
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: '#8b949e',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#21262d'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    {copiedCodeIndex === index ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              )}
              <pre
                style={{
                  margin: 0,
                  padding: '12px',
                  overflowX: 'auto',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                }}
              >
                <code style={{ color: '#c9d1d9' }}>{code.text}</code>
              </pre>
            </div>
          </div>
        ))}
      </div>

      {/* Footer: timestamp and copy */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '0 4px',
        }}
      >
        <span style={{ fontSize: '0.7rem', color: '#484f58' }}>{timeStr}</span>
        <button
          onClick={copyMessage}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#484f58',
            cursor: 'pointer',
            fontSize: '0.7rem',
            padding: '2px 6px',
            borderRadius: '3px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#8b949e'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = '#484f58'
          }}
        >
          {copiedMessage ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Token usage (assistant messages only) */}
      {!isUser && !isSystem && tokenUsage && tokenUsage.totalTokens ? (
        <div
          style={{
            fontSize: '11px',
            color: '#484f58',
            marginTop: '8px',
            padding: '0 4px',
            fontFamily: 'monospace',
          }}
        >
          <span title="Input tokens">{'\u2191'} {tokenUsage.inputTokens?.toLocaleString() ?? 0}</span>
          {'  '}
          <span title="Output tokens">{'\u2193'} {tokenUsage.outputTokens?.toLocaleString() ?? 0}</span>
          {'  '}
          <span title="Total tokens">{'\u03A3'} {tokenUsage.totalTokens.toLocaleString()}</span>
        </div>
      ) : null}
    </div>
  )
}

interface CodeBlock {
  language: string
  text: string
}

function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const regex = /```(\w+)?\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(content)) !== null) {
    blocks.push({
      language: match[1] || '',
      text: match[2].trim(),
    })
  }
  return blocks
}
