import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LayoutProvider } from './context/LayoutContext'

// Remove loading fallback on mount
const loadingEl = document.getElementById('loading-fallback')
if (loadingEl) loadingEl.remove()

// Root-level error boundary
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return React.createElement('div', { style: { padding: 24, background: '#0d0e0f', color: '#e3e2e3', fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh' } },
        React.createElement('h2', { style: { color: '#f85149', fontFamily: "'Instrument Serif', serif", fontStyle: 'italic' } }, 'Startup Error'),
        React.createElement('pre', { style: { background: '#121314', padding: 16, borderRadius: 4, whiteSpace: 'pre-wrap', fontSize: 13, color: '#bdc9ca' } },
          this.state.error.message + '\n\n' + (this.state.error.stack || '')
        ),
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LayoutProvider>
        <App />
      </LayoutProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
