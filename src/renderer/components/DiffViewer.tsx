import { useState, useMemo } from 'react'
import { Check, X } from 'lucide-react'
import { DiffEditor } from '@monaco-editor/react'
import { countDiffLines } from '../../main/utils/diff.js'

interface DiffViewerProps {
  filePath: string
  original: string
  diff: string
  onAccept: () => void
  onReject: () => void
  language: string
  theme: string
}

export default function DiffViewer({ filePath, original, diff, onAccept, onReject, language, theme }: DiffViewerProps) {
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const counts = useMemo(() => countDiffLines(diff), [diff])

  const handleAccept = async () => {
    setApplying(true)
    const result = await window.api.aiApplyDiff(filePath, diff)
    setApplying(false)
    if (result.success) {
      onAccept()
    } else {
      setError(result.error || 'Failed to apply diff')
    }
  }

  const fileName = filePath.split('/').at(-1) || filePath

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onReject}
    >
      <div
        style={{
          backgroundColor: '#0d1117',
          border: '1px solid #30363d',
          borderRadius: 12,
          width: '90vw',
          maxWidth: 1200,
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '12px 16px',
          borderBottom: '1px solid #21262d',
          gap: 12,
        }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#f0f6fc' }}>
            Proposed changes to {fileName}
          </span>
          <span style={{ fontSize: 12, color: '#3fb950' }}>+{counts.added}</span>
          <span style={{ fontSize: 12, color: '#f85149' }}>-{counts.removed}</span>
          <div style={{ flex: 1 }} />
          <button onClick={handleAccept} disabled={applying} style={{
            padding: '6px 16px', backgroundColor: '#238636', color: '#fff',
            border: 'none', borderRadius: 6, cursor: applying ? 'wait' : 'pointer',
            fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <Check size={14} /> {applying ? 'Applying...' : 'Accept All'}
          </button>
          <button onClick={onReject} style={{
            padding: '6px 16px', backgroundColor: 'transparent', color: '#f85149',
            border: '1px solid #f85149', borderRadius: 6, cursor: 'pointer',
            fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <X size={14} /> Reject
          </button>
        </div>

        {/* Error banner */}
        {error && (
          <div style={{
            padding: '8px 16px', backgroundColor: 'rgba(248,81,73,0.1)',
            color: '#f85149', fontSize: 13, borderBottom: '1px solid #21262d',
          }}>
            {error}
          </div>
        )}

        {/* Diff Editor */}
        <div style={{ flex: 1, padding: 8 }}>
          <DiffEditor
            original={original}
            modified=""
            language={language}
            theme={theme === 'light' ? 'vs' : 'vs-dark'}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              renderSideBySide: true,
              fontSize: 13,
            }}
          />
        </div>
      </div>
    </div>
  )
}
