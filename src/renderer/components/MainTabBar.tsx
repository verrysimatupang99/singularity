import { useCallback } from 'react'
import { MessageSquare, Code2, Terminal } from 'lucide-react'

export type MainTab = 'chat' | 'editor' | 'terminal'

const TABS: Array<{ id: MainTab; label: string; icon: React.ReactNode }> = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare size={14} /> },
  { id: 'editor', label: 'Editor', icon: <Code2 size={14} /> },
  { id: 'terminal', label: 'Terminal', icon: <Terminal size={14} /> },
]

interface MainTabBarProps {
  activeTab: MainTab
  onTabChange: (tab: MainTab) => void
}

export default function MainTabBar({ activeTab, onTabChange }: MainTabBarProps) {
  const handleClick = useCallback((id: MainTab) => () => onTabChange(id), [onTabChange])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', height: 36,
      backgroundColor: 'var(--surface-lowest)',
      borderBottom: '1px solid var(--outline-variant)',
      paddingLeft: 4,
      gap: 0,
    }}>
      {TABS.map(tab => {
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={handleClick(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px',
              background: isActive ? 'var(--surface)' : 'transparent',
              border: 'none',
              borderBottom: isActive ? '2px solid var(--primary)' : '2px solid transparent',
              borderRight: '1px solid var(--outline-variant)',
              color: isActive ? 'var(--on-surface)' : 'var(--on-surface-variant)',
              fontSize: 12,
              fontWeight: isActive ? 500 : 400,
              cursor: 'pointer',
              transition: 'color 0.1s, background-color 0.1s',
              opacity: isActive ? 1 : 0.55,
              position: 'relative',
            }}
            onMouseEnter={e => { if (!isActive) { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.backgroundColor = 'var(--surface-container)' } }}
            onMouseLeave={e => { if (!isActive) { e.currentTarget.style.opacity = '0.55'; e.currentTarget.style.backgroundColor = 'transparent' } }}
          >
            {tab.icon}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
