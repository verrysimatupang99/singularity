import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { LayoutProvider } from './context/LayoutContext'

// Root-level error boundary to catch and display startup errors
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return React.createElement('div', { style: { padding: 24, background: '#1a1a2e', color: '#e0e0e0', fontFamily: 'monospace', minHeight: '100vh' } },
        React.createElement('h2', { style: { color: '#f85149' } }, '🚨 Startup Error'),
        React.createElement('pre', { style: { background: '#0d1117', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: 13 } },
          this.state.error.message + '\n\n' + (this.state.error.stack || '')
        ),
        React.createElement('p', { style: { color: '#8b949e', marginTop: 16 } }, 'Check the Electron DevTools console (Ctrl+Shift+I) for more details.')
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
