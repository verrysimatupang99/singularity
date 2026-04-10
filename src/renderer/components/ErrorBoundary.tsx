import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode; context?: string }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: any) {
    window.api.crashReport?.({
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo?.componentStack,
      context: this.props.context,
    }).catch(() => {})
    // Also log via dedicated renderer error channel
    try {
      window.api.logRendererError?.({ message: error.message, stack: error.stack })
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: 16, backgroundColor: '#161b22', borderRadius: 8, border: '1px solid #f85149', margin: 8 }}>
          <h3 style={{ margin: '0 0 8px', color: '#f85149', fontSize: 14 }}>{this.props.context || 'Component'} crashed</h3>
          <pre style={{ fontSize: 11, color: '#8b949e', maxHeight: 100, overflow: 'auto', margin: '8px 0' }}>{this.state.error?.message}</pre>
          <button onClick={() => this.setState({ hasError: false })} style={{ padding: '4px 12px', backgroundColor: '#238636', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Try Again</button>
        </div>
      )
    }
    return this.props.children
  }
}
