import { useState, useCallback } from 'react'
import { ChatMessage } from '../types'
import { marked } from 'marked'
import { Copy, Check } from 'lucide-react'

interface MessageBubbleProps {
  message: ChatMessage
  tokenUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
  model?: string
}

export default function MessageBubble({ message, tokenUsage }: MessageBubbleProps) {
  const { content, role, timestamp } = message
  const isUser = role === 'user'
  const isSystem = role === 'system'

  // Parse markdown
  const htmlContent = marked.parse(content, { async: false }) as string

  // Extract code blocks for inline copy buttons
  const codeBlocks = extractCodeBlocks(content)

  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 16,
    }}>
      {/* Bubble */}
      <div style={{
        maxWidth: isUser ? '75%' : '100%',
        padding: isUser ? '10px 16px' : '0',
        borderRadius: isUser ? 12 : 0,
        backgroundColor: isUser ? 'var(--primary)' : 'transparent',
        color: isUser ? 'var(--on-primary-fixed)' : 'var(--on-surface)',
        fontSize: 13, lineHeight: 1.6,
      }}>
        {/* User messages: inline text */}
        {isUser ? (
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</div>
        ) : (
          /* Assistant messages: markdown + code blocks */
          <>
            {/* Markdown content */}
            <div
              className="markdown-content"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
              style={{ color: 'var(--on-surface)' }}
            />

            {/* Code blocks with copy buttons */}
            {codeBlocks.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {codeBlocks.map((code, index) => (
                  <CodeBlock key={index} language={code.language} text={code.text} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Footer: timestamp + token usage */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '0 2px' }}>
        <span style={{ fontSize: 10, color: 'var(--on-surface-variant)', opacity: 0.4 }}>{timeStr}</span>
        {!isUser && !isSystem && tokenUsage?.totalTokens ? (
          <span style={{ fontSize: 10, color: 'var(--on-surface-variant)', opacity: 0.4, fontFamily: 'var(--font-mono)' }}>
            {tokenUsage.totalTokens.toLocaleString()} tokens
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Code Block with Copy Button
// ---------------------------------------------------------------------------

function CodeBlock({ language, text }: { language: string; text: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }, [text])

  return (
    <div style={{
      backgroundColor: 'var(--surface-lowest)',
      border: '1px solid var(--outline-variant)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 12px',
        backgroundColor: 'var(--surface-container)',
        borderBottom: '1px solid var(--outline-variant)',
      }}>
        <span style={{ fontSize: 11, color: 'var(--on-surface-variant)', fontFamily: 'var(--font-mono)' }}>
          {language || 'code'}
        </span>
        <button onClick={handleCopy} className="ghost-btn" style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 4, fontSize: 11, color: 'var(--on-surface-variant)',
        }}>
          {copied ? <Check size={12} color="var(--success)" /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {/* Code */}
      <pre style={{
        margin: 0, padding: 12, overflowX: 'auto',
        fontSize: 12, lineHeight: 1.5,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        color: 'var(--on-surface-variant)',
      }}>
        <code>{text}</code>
      </pre>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CodeBlock {
  language: string
  text: string
}

function extractCodeBlocks(content: string): CodeBlock[] {
  const blocks: CodeBlock[] = []
  const regex = /```(\w+)?\n([\s\S]*?)```/g
  let match
  while ((match = regex.exec(content)) !== null) {
    blocks.push({ language: match[1] || '', text: match[2].trim() })
  }
  return blocks
}
