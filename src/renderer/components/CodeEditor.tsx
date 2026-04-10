import { useEffect, useRef, useCallback, useState } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import { useLayout } from '../context/LayoutContext'

interface CodeEditorProps {
  filePath: string
  onAskAI?: (context: { file: string; content: string; selection?: string }) => void
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact',
  js: 'javascript', jsx: 'javascriptreact',
  py: 'python', json: 'json', md: 'markdown',
  html: 'html', css: 'css', sh: 'shell',
  yaml: 'yaml', yml: 'yaml', toml: 'toml',
  rs: 'rust', go: 'go', rb: 'ruby',
}

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').at(-1)?.toLowerCase() || ''
  return LANG_MAP[ext] || 'plaintext'
}

export default function CodeEditor({ filePath, onAskAI }: CodeEditorProps) {
  const { markDirty, markClean, dirtyFiles, workspaceRoot } = useLayout()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [editorTheme, setEditorTheme] = useState('vs-dark')
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<Monaco | null>(null)

  // Detect theme from document attribute
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const theme = document.documentElement.getAttribute('data-theme')
      setEditorTheme(theme === 'light' ? 'vs' : 'vs-dark')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const current = document.documentElement.getAttribute('data-theme')
    setEditorTheme(current === 'light' ? 'vs' : 'vs-dark')
    return () => observer.disconnect()
  }, [])

  // Load file content
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.api.fsReadFile(filePath)
      .then((text) => {
        if (!cancelled) {
          setContent(text)
          setLoading(false)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setContent(`Error loading file: ${err.message}`)
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [filePath])

  const handleEditorDidMount = useCallback((editor: any, monaco: Monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Ctrl/Cmd+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      handleSave()
    })
  }, [filePath, content])

  const handleSave = useCallback(async () => {
    if (!editorRef.current) return
    const value = editorRef.current.getValue()
    await window.api.fsWriteFile(filePath, value)
    markClean(filePath)
  }, [filePath, markClean])

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined && value !== content) {
      setContent(value)
      markDirty(filePath)
    }
  }, [filePath, content, markDirty])

  const handleAskAI = useCallback(() => {
    if (!editorRef.current || !onAskAI) return
    const fileContent = editorRef.current.getValue()
    const selection = editorRef.current.getValue() // full content for now
    onAskAI({ file: filePath, content: fileContent, selection })
  }, [filePath, onAskAI])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#8b949e' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      {/* Ask AI floating bar */}
      <div style={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 100,
        display: 'flex',
        gap: 4,
      }}>
        <button
          onClick={handleAskAI}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            backgroundColor: 'rgba(56, 139, 253, 0.15)',
            color: '#58a6ff',
            border: '1px solid rgba(56, 139, 253, 0.3)',
            borderRadius: 6,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
          }}
        >
          &#x2728; Ask AI
        </button>
      </div>
      <Editor
        height="100%"
        path={filePath}
        language={getLanguage(filePath)}
        value={content}
        theme={editorTheme}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
          lineNumbers: 'on',
          minimap: { enabled: false },
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          formatOnPaste: true,
          tabSize: 2,
          insertSpaces: true,
          padding: { top: 8, bottom: 8 },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
        }}
      />
    </div>
  )
}
