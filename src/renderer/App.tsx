import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { Session, ChatMessage, ProviderInfo, PROVIDERS, ToolCall, Attachment } from './types'
import { useLayout } from './context/LayoutContext'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsView from './components/SettingsView'
import ToolCallInspector from './components/ToolCallInspector'
import MainTabBar, { MainTab } from './components/MainTabBar'
import StatusBar from './components/StatusBar'
import CodeEditor from './components/CodeEditor'
import TerminalPanel from './components/TerminalPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import OnboardingWizard from './components/OnboardingWizard'
import UpdateNotification from './components/UpdateNotification'

const OrchestratorView = lazy(() => import('./components/OrchestratorView'))
const AgentView = lazy(() => import('./components/AgentView'))

type View = 'chat' | 'settings'

interface AppSettings {
  theme: 'dark' | 'light'
  defaultProvider: string
  defaultModel: string
  apiKeys: Record<string, string>
}

export default function App() {
  // View state
  const [currentView, setCurrentView] = useState<View>('chat')
  const [mainTab, setMainTab] = useState<MainTab>('chat')

  // Session state
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sessionTokenTotals, setSessionTokenTotals] = useState<Record<string, number>>({})

  // New session dialog
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')

  // Chat state
  const [isLoading, setIsLoading] = useState(false)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)

  // Settings state
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [providers, setProviders] = useState<ProviderInfo[]>([])

  // Tool call inspector state
  const [showToolInspector, setShowToolInspector] = useState(false)
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([])

  // Pending chat message
  const [pendingChatMessage, setPendingChatMessage] = useState('')

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Layout context
  const {
    panels,
    activeFile,
    openFile,
    workspaceRoot,
    setWorkspaceRoot,
  } = useLayout()

  // Load initial data
  useEffect(() => {
    loadSessions()
    loadSettings()
    checkOnboarding()
  }, [])

  // Chat streaming listener
  useEffect(() => {
    const unsub = window.api.onChatChunk((data) => {
      if (data.done) {
        setStreamingContent(null)
        setIsLoading(false)
        setActiveRequestId(null)
        if (data.content && !data.content.startsWith('Error:')) {
          const assistantMsg: ChatMessage = {
            id: `msg_${Date.now()}`,
            role: 'assistant',
            content: data.content,
            timestamp: Date.now(),
            tokenUsage: data.usage,
          }
          setMessages(prev => [...prev, assistantMsg])
          if (data.usage?.totalTokens && activeSessionId) {
            setSessionTokenTotals(prev => ({
              ...prev,
              [activeSessionId]: (prev[activeSessionId] || 0) + data.usage!.totalTokens!,
            }))
            window.api.tokenRecord({
              sessionId: activeSessionId,
              providerId: sessions.find(s => s.id === activeSessionId)?.provider || '',
              model: sessions.find(s => s.id === activeSessionId)?.model || '',
              promptTokens: data.usage!.inputTokens ?? 0,
              completionTokens: data.usage!.outputTokens ?? 0,
              totalTokens: data.usage!.totalTokens ?? 0,
              cost: 0,
              timestamp: Date.now(),
            })
          }
        }
      } else {
        setStreamingContent(data.content)
      }
    })
    return unsub
  }, [activeSessionId, sessions])

  // Agent event listener
  useEffect(() => {
    const unsub = window.api.onAgentEvent((event: any) => {
      if (event.toolCall) {
        const tc: ToolCall = {
          id: event.toolCall.toolName || 'unknown',
          name: event.toolCall.toolName || 'unknown',
          args: event.toolCall.args || {},
          status: 'executing',
          timestamp: Date.now(),
        }
        setToolCalls(prev => [...prev, tc])
      }
    })
    return unsub
  }, [])

  const loadSessions = async () => {
    try {
      const list = await window.api.sessionsList()
      setSessions(list)
    } catch { /* ignore */ }
  }

  const loadSettings = async () => {
    try {
      const s = await window.api.settingsGet()
      setSettings(s)
    } catch { /* ignore */ }
  }

  const checkOnboarding = async () => {
    try {
      const isFirst = await window.api.storageIsFirstRun()
      setShowOnboarding(isFirst)
    } catch { /* ignore */ }
  }

  // --- Session Management ---

  const handleCreateSession = useCallback(async () => {
    const provider = selectedProvider || settings?.defaultProvider || 'openai'
    const model = selectedModel || settings?.defaultModel || 'gpt-4o'
    try {
      const session = await window.api.sessionCreate({ provider, model })
      setSessions(prev => [...prev, session])
      setActiveSessionId(session.id)
      setMessages([])
      setShowNewSessionDialog(false)
      setStreamingContent(null)
      setMainTab('chat')
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }, [selectedProvider, selectedModel, settings])

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await window.api.sessionDelete(id)
      setSessions(prev => prev.filter(s => s.id !== id))
      if (activeSessionId === id) {
        setActiveSessionId(null)
        setMessages([])
      }
    } catch (err) {
      console.error('Failed to delete session:', err)
    }
  }, [activeSessionId])

  const handleSelectSession = useCallback(async (id: string) => {
    setActiveSessionId(id)
    setStreamingContent(null)
    setToolCalls([])
    setMainTab('chat')
    try {
      const { session, messages: loadedMessages } = await window.api.sessionLoad(id)
      setMessages(loadedMessages)
      // Restore token total
      const total = loadedMessages.reduce((sum, m) => sum + (m.tokenUsage?.totalTokens || 0), 0)
      if (total > 0) setSessionTokenTotals(prev => ({ ...prev, [session.id]: total }))
    } catch { /* ignore */ }
  }, [])

  const handleNewSession = useCallback(() => {
    if (settings?.defaultProvider) {
      setSelectedProvider(settings.defaultProvider)
      setSelectedModel(settings.defaultModel || '')
    }
    setShowNewSessionDialog(true)
  }, [settings])

  // --- Chat ---

  const handleSendMessage = useCallback(async (content: string, attachments?: Attachment[]) => {
    if (!activeSessionId) return
    const session = sessions.find(s => s.id === activeSessionId)
    if (!session) return

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      attachments,
    }
    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)

    try {
      const apiMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const requestId = await window.api.chatSend(session.provider, session.model, apiMessages)
      setActiveRequestId(requestId)
    } catch (err) {
      console.error('Failed to send message:', err)
      setIsLoading(false)
    }
  }, [activeSessionId, sessions, messages])

  const handleCancel = useCallback(async () => {
    if (activeRequestId) {
      await window.api.chatCancel(activeRequestId)
      setActiveRequestId(null)
      setStreamingContent(null)
      setIsLoading(false)
    }
  }, [activeRequestId])

  const handleSaveMessages = useCallback(async (msgs: ChatMessage[]) => {
    if (!activeSessionId) return
    try {
      await window.api.sessionSave(activeSessionId, msgs)
    } catch { /* ignore */ }
  }, [activeSessionId])

  // --- Workspace ---

  const handleOpenFolder = useCallback(async () => {
    const folderPath = await window.api.fsPickFolder()
    if (folderPath) setWorkspaceRoot(folderPath)
  }, [setWorkspaceRoot])

  const handleOpenFile = useCallback((path: string) => {
    openFile(path)
    setMainTab('editor')
  }, [openFile])

  // --- Settings ---

  const handleOpenSettings = useCallback(() => {
    setCurrentView('settings')
  }, [])

  const handleBackFromSettings = useCallback(() => {
    setCurrentView('chat')
  }, [])

  const handleSetApiKey = useCallback(async (provider: string, key: string) => {
    try {
      await window.api.authSetApiKey(provider, key)
      return true
    } catch { return false }
  }, [])

  const handleDeleteApiKey = useCallback(async (provider: string) => {
    await window.api.authDeleteApiKey(provider)
  }, [])

  const handleSaveSettings = useCallback(async (updates: Partial<AppSettings>) => {
    try {
      await window.api.settingsSet(updates)
      setSettings(prev => prev ? { ...prev, ...updates } : prev)
    } catch { /* ignore */ }
  }, [])

  // --- New Session Dialog ---

  const newSessionDialog = showNewSessionDialog ? (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={() => setShowNewSessionDialog(false)}
    >
      <div
        style={{
          backgroundColor: 'var(--surface-container-high)',
          border: '1px solid rgba(62, 73, 74, 0.2)',
          borderRadius: 12,
          padding: 24,
          width: 400,
          maxWidth: '90vw',
        }}
        onClick={e => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600, color: 'var(--on-surface)' }}>
          New Session
        </h3>

        <label style={{ fontSize: 12, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 4 }}>
          Provider
        </label>
        <select
          value={selectedProvider}
          onChange={e => { setSelectedProvider(e.target.value); setSelectedModel('') }}
          style={{
            width: '100%', padding: '8px 12px', marginBottom: 12,
            backgroundColor: 'var(--surface)', border: '1px solid rgba(62, 73, 74, 0.2)',
            borderRadius: 6, color: 'var(--on-surface)', fontSize: 13,
          }}
        >
          <option value="">Select provider...</option>
          {PROVIDERS.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        <label style={{ fontSize: 12, color: 'var(--on-surface-variant)', display: 'block', marginBottom: 4 }}>
          Model
        </label>
        <select
          value={selectedModel}
          onChange={e => setSelectedModel(e.target.value)}
          style={{
            width: '100%', padding: '8px 12px', marginBottom: 16,
            backgroundColor: 'var(--surface)', border: '1px solid rgba(62, 73, 74, 0.2)',
            borderRadius: 6, color: 'var(--on-surface)', fontSize: 13,
          }}
        >
          <option value="">Select model...</option>
          {PROVIDERS.find(p => p.id === selectedProvider)?.models.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setShowNewSessionDialog(false)}
            style={{
              padding: '8px 16px', backgroundColor: 'var(--surface-container-highest)',
              color: 'var(--on-surface)', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreateSession}
            disabled={!selectedProvider || !selectedModel}
            style={{
              padding: '8px 16px',
              backgroundColor: selectedProvider && selectedModel ? 'var(--primary)' : 'var(--surface-container-highest)',
              color: selectedProvider && selectedModel ? 'var(--on-primary)' : 'var(--on-surface-variant)',
              border: 'none', borderRadius: 6,
              cursor: selectedProvider && selectedModel ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 500,
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  ) : null

  // --- Render ---

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => { setShowOnboarding(false); window.api.storageMarkOnboardingComplete() }} />
  }

  if (currentView === 'settings') {
    return (
      <ErrorBoundary>
        <SettingsView
          settings={settings}
          providers={providers}
          onSaveSettings={handleSaveSettings}
          onSetApiKey={handleSetApiKey}
          onDeleteApiKey={handleDeleteApiKey}
          onBack={handleBackFromSettings}
        />
        <UpdateNotification />
      </ErrorBoundary>
    )
  }

  const activeSession = sessions.find(s => s.id === activeSessionId)
  const totalTokens = sessionTokenTotals[activeSessionId || ''] || 0
  const contextWindow = activeSession ? 128000 : undefined // default context window

  return (
    <ErrorBoundary>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          backgroundColor: 'var(--surface)',
          color: 'var(--on-surface)',
          overflow: 'hidden',
        }}
      >
        {/* Main content area: Sidebar + Content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar */}
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
            onOpenSettings={handleOpenSettings}
            workspaceRoot={workspaceRoot}
            onOpenFile={handleOpenFile}
          />

          {/* Main content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Tab bar */}
            <MainTabBar activeTab={mainTab} onTabChange={setMainTab} />

            {/* Tab content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
              {/* Main tab content */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {mainTab === 'chat' && (
                  <ChatView
                    session={activeSession || null}
                    messages={messages}
                    onSendMessage={handleSendMessage}
                    onSaveMessages={handleSaveMessages}
                    isLoading={isLoading}
                    onCancel={handleCancel}
                    streamingContent={streamingContent}
                    activeToolCalls={toolCalls}
                    initialMessage={pendingChatMessage}
                    onMessageSent={() => setPendingChatMessage('')}
                    contextWindow={contextWindow}
                  />
                )}
                {mainTab === 'editor' && (
                  <CodeEditor />
                )}
                {mainTab === 'terminal' && (
                  <TerminalPanel cwd={workspaceRoot || undefined} />
                )}
              </div>

              {/* Tool call inspector (right panel) */}
              {showToolInspector && toolCalls.length > 0 && (
                <div
                  style={{
                    width: 320,
                    minWidth: 320,
                    borderLeft: '1px solid rgba(62, 73, 74, 0.1)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <div style={{
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(62, 73, 74, 0.1)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)' }}>
                      Tool Calls
                    </span>
                    <button
                      onClick={() => setShowToolInspector(false)}
                      style={{
                        background: 'none', border: 'none', color: 'var(--on-surface-variant)',
                        cursor: 'pointer', padding: 2,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                  <ToolCallInspector
                    toolCalls={toolCalls}
                    onClear={() => setToolCalls([])}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Status bar */}
        <StatusBar
          provider={activeSession?.provider || ''}
          model={activeSession?.model || ''}
          tokenCount={totalTokens > 0 ? totalTokens : undefined}
          contextWindow={contextWindow}
        />

        {/* Overlays */}
        {newSessionDialog}

        {/* Orchestrator/Agent overlay (lazy) */}
        <Suspense fallback={null}>
          {panels?.orchestrator?.open && <OrchestratorView />}
          {panels?.agent?.open && <AgentView />}
        </Suspense>

        <UpdateNotification />
      </div>
    </ErrorBoundary>
  )
}
