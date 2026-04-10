import { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { Plus } from 'lucide-react'
import 'xterm/css/xterm.css'

interface TerminalPanelProps {
  workspaceRoot: string | null
}

export default function TerminalPanel({ workspaceRoot }: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [termId, setTermId] = useState<string | null>(null)

  useEffect(() => {
    if (!terminalRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      theme: {
        background: '#0d1117',
        foreground: '#c9d1d9',
        cursor: '#58a6ff',
        selectionBackground: 'rgba(88, 166, 255, 0.3)',
        black: '#0d1117',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#c9d1d9',
      },
      scrollback: 1000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()

    xtermRef.current = term
    fitRef.current = fitAddon

    // Create terminal backend
    window.api.terminalCreate({ cwd: workspaceRoot || process.cwd() })
      .then(({ termId: id }) => {
        setTermId(id)
        // Send user input to terminal
        term.onData((data) => {
          window.api.terminalWrite({ termId: id, data })
        })
      })

    // Receive terminal output
    const unsubData = window.api.onTerminalData(({ termId: id, data }) => {
      if (xtermRef.current) xtermRef.current.write(data)
    })

    // Handle terminal exit
    const unsubExit = window.api.onTerminalExit(({ termId: id, exitCode }) => {
      if (id === termId && xtermRef.current) {
        xtermRef.current.writeln(`\r\nProcess exited with code ${exitCode}`)
      }
    })

    // Resize observer
    const observer = new ResizeObserver(() => {
      fitAddon.fit()
      if (termId) {
        const dims = fitAddon.proposeDimensions()
        if (dims?.cols && dims?.rows) {
          window.api.terminalResize({ termId, cols: dims.cols, rows: dims.rows })
        }
      }
    })
    observer.observe(terminalRef.current)

    return () => {
      observer.disconnect()
      unsubData()
      unsubExit()
      if (termId) window.api.terminalKill(termId)
      term.dispose()
    }
  }, [workspaceRoot])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#0d1117' }}>
      {/* Terminal header bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '4px 12px',
        backgroundColor: '#161b22',
        borderBottom: '1px solid #21262d',
        fontSize: 12,
        color: '#8b949e',
        gap: 8,
      }}>
        <span>Terminal</span>
        <div style={{ flex: 1 }} />
        <button
          title="New Terminal"
          style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 2 }}
        >
          <Plus size={14} />
        </button>
      </div>
      {/* Terminal body */}
      <div ref={terminalRef} style={{ flex: 1, overflow: 'hidden' }} />
    </div>
  )
}
