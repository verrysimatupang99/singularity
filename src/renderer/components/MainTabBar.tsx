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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 36,
        backgroundColor: 'var(--surface-container-lowest)',
        borderBottom: '1px solid rgba(62, 73, 74, 0.15)',
        paddingLeft: 8,
        gap: 2,
      }}
    >
      {TABS.map(tab => (
        <button
          key={tab.id}
          onClick={handleClick(tab.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === tab.id ? 'var(--on-surface)' : 'var(--on-surface-variant)',
            fontSize: 12,
            fontWeight: activeTab === tab.id ? 600 : 400,
            cursor: 'pointer',
            transition: 'color 0.1s',
            opacity: activeTab === tab.id ? 1 : 0.6,
          }}
          onMouseEnter={e => { if (activeTab !== tab.id) e.currentTarget.style.opacity = '0.85' }}
          onMouseLeave={e => { if (activeTab !== tab.id) e.currentTarget.style.opacity = '0.6' }}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
