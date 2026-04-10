import { useLayout } from '../context/LayoutContext'
import { FolderOpen, MessageSquare, Wrench, Settings, Search, Bot, Network, Monitor, Database, BarChart3 } from 'lucide-react'

export default function ActivityBar() {
  const { panels, togglePanel, workspaceRoot, setWorkspaceRoot } = useLayout()

  const handleFolderOpen = async () => {
    if (!workspaceRoot) {
      const picked = await window.api.fsPickFolder()
      if (picked) {
        setWorkspaceRoot(picked)
      }
    } else {
      togglePanel('fileTree')
    }
  }

  const buttons = [
    {
      icon: FolderOpen,
      label: 'File Explorer',
      action: handleFolderOpen,
      panel: 'fileTree' as const,
    },
    { icon: Search, label: 'Search', panel: 'search' as const },
    { icon: MessageSquare, label: 'Chat', panel: 'chat' as const },
    { icon: Bot, label: 'Agent', panel: 'agent' as const },
    { icon: Network, label: 'Orchestrator', panel: 'orchestrator' as const },
    { icon: Monitor, label: 'Computer Use', panel: 'computerUse' as const },
    { icon: Database, label: 'Memory Browser', panel: 'memoryBrowser' as const },
    { icon: BarChart3, label: 'Token Usage', panel: 'tokenDashboard' as const },
    { icon: Wrench, label: 'MCP Tools', action: () => togglePanel('sidebar' as any) },
  ]

  return (
    <div style={{
      width: 48,
      minWidth: 48,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      paddingTop: 8,
      backgroundColor: '#1a1a2e',
      borderRight: '1px solid #21262d',
    }}>
      {buttons.map((btn, i) => (
        <button
          key={i}
          title={btn.label}
          onClick={() => btn.action?.() ?? togglePanel(btn.panel)}
          style={{
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            backgroundColor: 'transparent',
            color: btn.panel && panels[btn.panel]?.open ? '#fff' : '#8b949e',
            borderLeft: btn.action
              ? workspaceRoot
                ? panels[btn.panel]?.open
                  ? '2px solid #388bfd'
                  : '2px solid transparent'
                : '2px solid #388bfd'
              : btn.panel && panels[btn.panel]?.open
                ? '2px solid #388bfd'
                : '2px solid transparent',
          }}
        >
          <btn.icon size={20} />
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button
        title="Settings"
        onClick={() => togglePanel('chat' as any)}
        style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 6, cursor: 'pointer', backgroundColor: 'transparent', color: '#8b949e' }}
      >
        <Settings size={20} />
      </button>
    </div>
  )
}
