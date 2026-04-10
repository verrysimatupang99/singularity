import { useCallback } from 'react'
import { useLayout } from '../context/LayoutContext'
import type { PanelState } from '../context/LayoutContext'

interface ActivityBarProps {
  activeView: string
  onViewChange: (view: string) => void
}

type PanelKey = keyof Omit<PanelState, 'terminal'>

const NAV_ITEMS: { key: string; label: string; icon: string }[] = [
  { key: 'fileTree', label: 'Files', icon: 'folder_open' },
  { key: 'chat', label: 'Chat', icon: 'chat_bubble' },
  { key: 'search', label: 'Search', icon: 'search' },
  { key: 'orchestrator', label: 'Agent', icon: 'extension' },
]

const BOTTOM_ITEMS: { key: string; label: string; icon: string }[] = [
  { key: 'memoryBrowser', label: 'Memory', icon: 'memory' },
  { key: 'tokenDashboard', label: 'Usage', icon: 'bar_chart' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
]

export default function ActivityBar({ activeView, onViewChange }: ActivityBarProps) {
  const { panels, togglePanel } = useLayout()

  const handleClick = useCallback((key: string) => {
    if (key === 'settings' || key === 'memoryBrowser' || key === 'tokenDashboard') {
      // These are panel views — toggle them
      const panelKey = key as PanelKey
      if (!panels[panelKey]?.open) {
        togglePanel(panelKey)
      }
      onViewChange(key)
    } else {
      const panelKey = key as PanelKey
      togglePanel(panelKey)
      onViewChange(key)
    }
  }, [panels, togglePanel, onViewChange])

  const isActive = (key: string): boolean => {
    if (key === 'settings' || key === 'memoryBrowser' || key === 'tokenDashboard') {
      return activeView === key
    }
    const panelKey = key as PanelKey
    return panels[panelKey]?.open || activeView === key
  }

  return (
    <aside
      className="activity-bar"
      style={{
        width: 64,
        minWidth: 64,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '16px 0',
        backgroundColor: 'var(--surface-lowest)',
        position: 'relative',
        zIndex: 50,
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: 32, fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 20, color: 'var(--primary)', cursor: 'default' }}>
        ∞
      </div>

      {/* Top nav items */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%' }}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item.key)
          return (
            <button
              key={item.key}
              onClick={() => handleClick(item.key)}
              title={item.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '8px 0',
                width: '100%',
                border: 'none',
                cursor: 'pointer',
                background: active ? 'var(--surface)' : 'transparent',
                borderLeft: active ? '2px solid var(--primary)' : '2px solid transparent',
                opacity: active ? 1 : 0.6,
                transition: 'opacity 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.opacity = '1' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.opacity = '0.6' }}
            >
              <span style={{ fontSize: 20, fontFamily: 'Material Symbols Outlined', fontVariationSettings: active ? "'FILL' 1, 'wght' 300" : "'FILL' 0, 'wght' 300" }}>
                {item.icon}
              </span>
              <span style={{
                fontSize: 11,
                fontFamily: 'Inter',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: active ? 'var(--primary)' : 'var(--on-surface-variant)',
              }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* Bottom items */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: '100%' }}>
        {BOTTOM_ITEMS.map(item => {
          const active = isActive(item.key)
          return (
            <button
              key={item.key}
              onClick={() => handleClick(item.key)}
              title={item.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '8px 0',
                width: '100%',
                border: 'none',
                cursor: 'pointer',
                background: active ? 'var(--surface)' : 'transparent',
                borderLeft: active ? '2px solid var(--primary)' : '2px solid transparent',
                opacity: active ? 1 : 0.6,
                transition: 'opacity 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.opacity = '1' }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.opacity = '0.6' }}
            >
              <span style={{ fontSize: 20, fontFamily: 'Material Symbols Outlined', fontVariationSettings: active ? "'FILL' 1, 'wght' 300" : "'FILL' 0, 'wght' 300" }}>
                {item.icon}
              </span>
              <span style={{
                fontSize: 11,
                fontFamily: 'Inter',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: active ? 'var(--primary)' : 'var(--on-surface-variant)',
              }}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
