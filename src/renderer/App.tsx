import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { Session, ChatMessage, ProviderInfo, PROVIDERS, ToolCall, StreamChunk, Attachment } from './types'
import { useLayout } from './context/LayoutContext'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsView from './components/SettingsView'
import ToolCallInspector from './components/ToolCallInspector'
import ActivityBar from './components/ActivityBar'
import FileTree from './components/FileTree'
import ResizableDivider from './components/ResizableDivider'
import EditorTabBar from './components/EditorTabBar'
import CodeEditor from './components/CodeEditor'
import TerminalPanel from './components/TerminalPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import OnboardingWizard from './components/OnboardingWizard'
import UpdateNotification from './components/UpdateNotification'

const OrchestratorView = lazy(() => import('./components/OrchestratorView'))
const AgentView = lazy(() => import('./components/AgentView'))
const SearchPanel = lazy(() => import('./components/SearchPanel'))
const ComputerUseView = lazy(() => import('./components/ComputerUseView'))
const TokenDashboard = lazy(() => import('./components/TokenDashboard'))
const MemoryBrowser = lazy(() => import('./components/MemoryBrowser'))

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

  // Pending chat message (from inline chat or other sources)
  const [pendingChatMessage, setPendingChatMessage] = useState('')

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Layout context
  const {
    panels,
    togglePanel,
    setPanelWidth,
    setTerminalHeight,
    activeFile,
    openFile,
    workspaceRoot,
  } = useLayout()

  // Load initial data
  useEffect(() => {
    loadSessions()
    loadSettings()
    const cleanup1 = setupChatChunkListener()
    const cleanup2 = setupCliStreamListener()
    return () => { cleanup1?.(); cleanup2?.() }
  }, [])

  // Refresh provider status when settings change
  useEffect(() => {
    loadProviderStatus()
  }, [settings])

  // Check onboarding on mount
  useEffect(() => {
    checkOnboarding()
  }, [])

  const checkOnboarding = useCallback(async () => {
    try {
      const isFirst = await (window as any).api?.storageIsFirstRun?.()
      if (isFirst) setShowOnboarding(true)
    } catch {}
  }, [])

  const loadSessions = useCallback(async () => {
    try {
      const list = await window.api.sessionsList()
      setSessions(list)
    } catch (err) {
      console.error('Failed to load sessions:', err)
    }
  }, [])

  const loadSettings = useCallback(async () => {
    try {
      const s = await window.api.settingsGet()
      setSettings(s)
    } catch (err) {
      console.error('Failed to load settings:', err)
    }
  }, [])

  const loadProviderStatus = useCallback(async () => {
    try {
      const status = await window.api.authStatus()
      const providerInfos: ProviderInfo[] = PROVIDERS.map((p) => ({
        id: p.id,
        name: p.name,
        icon: p.id,
        status: status[p.id]?.status === 'connected' ? 'connected' : 'disconnected',
        models: (status[p.id]?.models || p.models).map((m: string) => ({ id: m, name: m })),
      }))
      setProviders(providerInfos)
    } catch (err) {
      console.error('Failed to load provider status:', err)
    }
  }, [])

  const setupChatChunkListener = useCallback(() => {
    return window.api.onChatChunk((data) => {
      if (data.requestId === activeRequestId) {
        setStreamingContent(data.content)
        if (data.done) {
          setIsLoading(false)
          setActiveRequestId(null)
          if (data.content) {
            const assistantMsg: ChatMessage = {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: data.content,
              timestamp: Date.now(),
            }
            setMessages(prev => [...prev, assistantMsg])
          }
        }
      }
    })
  }, [activeRequestId])

  const setupCliStreamListener = useCallback(() => {
    return window.api.onCliStream(({ sessionId, chunk }) => {
      if (chunk?.type === 'tool_call' && chunk?.toolCall) {
        setToolCalls(prev => [...prev, {
          id: chunk.toolCall?.id || `tool_${Date.now()}`,
          name: chunk.toolCall?.command || 'unknown',
          args: chunk.toolCall?.args || {},
          status: 'pending',
          timestamp: Date.now(),
        }])
      }
    })
  }, [])

  // Select session
  const handleSelectSession = useCallback(async (id: string) => {
    setActiveSessionId(id)
    try {
      const { session, messages: msgs } = await window.api.sessionLoad(id)
      setMessages(msgs)
    } catch (err) {
      console.error('Failed to load session:', err)
    }
  }, [])

  // Create new session
  const handleNewSession = useCallback(() => {
    const defaultProvider = settings?.defaultProvider || 'openai'
    const providerInfo = providers.find((p) => p.id === defaultProvider)
    const defaultModel = providerInfo?.models[0]?.id || ''
    setSelectedProvider(defaultProvider)
    setSelectedModel(defaultModel)
    setShowNewSessionDialog(true)
  }, [settings, providers])

  const handleConfirmNewSession = useCallback(async () => {
    if (!selectedProvider || !selectedModel) return
    setShowNewSessionDialog(false)

    try {
      const session = await window.api.sessionCreate({
        provider: selectedProvider,
        model: selectedModel,
      })
      setSessions((prev) => [session, ...prev])
      handleSelectSession(session.id)
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }, [selectedProvider, selectedModel, handleSelectSession])

  // Delete session
  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await window.api.sessionDelete(id)
        setSessions((prev) => prev.filter((s) => s.id !== id))
        if (activeSessionId === id) {
          setActiveSessionId(null)
          setMessages([])
        }
      } catch (err) {
        console.error('Failed to delete session:', err)
      }
    },
    [activeSessionId],
  )

  // Save settings
  const handleSaveSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      try {
        await window.api.settingsSet(updates)
        setSettings((prev) => (prev ? { ...prev, ...updates } : (updates as AppSettings)))
      } catch (err) {
        console.error('Failed to save settings:', err)
      }
    },
    [],
  )

  // Set API key
  const handleSetApiKey = useCallback(async (provider: string, key: string) => {
    try {
      await window.api.authSetApiKey(provider, key)
      setSettings(prev => prev ? { ...prev, apiKeys: { ...prev.apiKeys, [provider]: key } } : { apiKeys: { [provider]: key } } as any)
    } catch (err) {
      console.error('Failed to set API key:', err)
    }
  }, [])

  // Delete API key
  const handleDeleteApiKey = useCallback(async (provider: string) => {
    try {
      await window.api.authDeleteApiKey(provider)
      setSettings(prev => {
        if (!prev) return prev
        const { [provider]: _, ...rest } = prev.apiKeys
        return { ...prev, apiKeys: rest }
      })
    } catch (err) {
      console.error('Failed to delete API key:', err)
    }
  }, [])

  // Send message
  const handleSendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      if (!activeSessionId || isLoading) return

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, userMsg])
      setStreamingContent(null)
      setIsLoading(true)

      const session = sessions.find((s) => s.id === activeSessionId)
      if (!session) return

      const allMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }))

      try {
        const apiKey = settings?.apiKeys?.[session.provider]
        const requestId = await window.api.chatSend(session.provider, session.model, allMessages, apiKey)
        setActiveRequestId(requestId)
      } catch (err) {
        console.error('Failed to send message:', err)
        setIsLoading(false)
      }
    },
    [activeSessionId, isLoading, messages, sessions, settings],
  )

  // Save messages
  const handleSaveMessages = useCallback(
    async (msgs: ChatMessage[]) => {
      if (!activeSessionId) return
      try {
        await window.api.sessionSave(activeSessionId, msgs)
      } catch (err) {
        console.error('Failed to save messages:', err)
      }
    },
    [activeSessionId],
  )

  // Handle "Ask AI" from editor
  const handleEditorAskAI = useCallback((context: { file: string; content: string; selection?: string }) => {
    setCurrentView('chat')
    if (!panels.chat.open) togglePanel('chat' as any)
    if (!panels.editor.open) togglePanel('editor' as any)

    const fileName = context.file.split('/').at(-1) || context.file
    const ext = context.file.split('.').at(-1) || ''
    const prefix = context.selection
      ? `Here's a selection from \`${fileName}\`:\n\n\`\`\`${ext}\n${context.selection}\n\`\`\``
      : `Here's the content of \`${fileName}\`:\n\n\`\`\`${ext}\n${context.content}\n\`\`\``

    setPendingChatMessage(prefix + '\n\n')
  }, [togglePanel, panels])

  // Cancel streaming
  const handleCancel = useCallback(() => {
    if (activeRequestId) {
      window.api.chatCancel(activeRequestId)
      setIsLoading(false)
      setActiveRequestId(null)
      setStreamingContent(null)
    }
  }, [activeRequestId])

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null

  // Compute context window for active session
  const contextWindow = useMemo(() => {
    if (!activeSession) return undefined
    const providerInfo = providers.find(p => p.id === activeSession.provider)
    if (!providerInfo) return undefined
    const modelInfo = providerInfo.models.find((m) => m.id === activeSession.model)
    return modelInfo?.contextWindow
  }, [activeSession, providers])

  return (
    <div
      className="ide-root"
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--surface-lowest)',
        color: 'var(--on-surface)',
        fontFamily: "'Inter', system-ui, sans-serif",
        margin: 0,
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {/* Onboarding Wizard */}
      {showOnboarding && <OnboardingWizard onComplete={() => setShowOnboarding(false)} onSkip={() => setShowOnboarding(false)} />}

      {/* Activity Bar */}
      <ActivityBar
        activeView={currentView}
        onViewChange={setCurrentView}
      />

      {/* Main content area */}
      <main style={{ flex: 1, display: 'flex', minWidth: 0, overflow: 'hidden' }}>
        {/* Session List Sidebar */}
        <ErrorBoundary context="sidebar">
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
            providers={providers}
          />
        </ErrorBoundary>

        {/* Center area: FileTree + Editor/Chat + Terminal */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {panels.fileTree.open && (
            <>
              <ErrorBoundary context="file-tree">
                <div style={{ width: panels.fileTree.width, flexShrink: 0, overflow: 'hidden', backgroundColor: 'var(--surface-container-low)' }}>
                  <FileTree
                    rootPath={workspaceRoot || ''}
                    onFileOpen={(path) => { openFile(path); togglePanel('editor' as any) }}
                    activeFile={activeFile}
                  />
                </div>
              </ErrorBoundary>
              <ErrorBoundary context="file-tree-divider">
                <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('fileTree', panels.fileTree.width + d)} />
              </ErrorBoundary>
            </>
          )}

          {/* Center: Editor or Chat */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {panels.editor.open && activeFile ? (
              <ErrorBoundary context="editor">
                <EditorTabBar
                  openFiles={[]}
                  activeFile={activeFile}
                  dirtyFiles={new Set()}
                  onTabClick={() => {}}
                  onTabClose={() => togglePanel('editor' as any)}
                  workspaceRoot={workspaceRoot}
                />
                <CodeEditor
                  filePath={activeFile}
                  provider={activeSession?.provider || settings?.defaultProvider || 'openai'}
                  model={activeSession?.model || settings?.defaultModel || 'gpt-4o'}
                  onAskAI={handleEditorAskAI}
                  onInlineChatToChat={() => {}}
                />
              </ErrorBoundary>
            ) : currentView === 'settings' ? (
              <ErrorBoundary context="settings">
                <SettingsView
                  settings={settings}
                  providers={providers}
                  onSaveSettings={handleSaveSettings}
                  onSetApiKey={handleSetApiKey}
                  onDeleteApiKey={handleDeleteApiKey}
                  onBack={() => setCurrentView('chat')}
                />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary context="chat-view">
                <ChatView
                  session={activeSession}
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onSaveMessages={handleSaveMessages}
                  isLoading={isLoading}
                  onCancel={handleCancel}
                  streamingContent={streamingContent}
                  activeToolCalls={toolCalls}
                  contextWindow={contextWindow}
                  initialMessage={pendingChatMessage}
                  onMessageSent={() => setPendingChatMessage('')}
                />
              </ErrorBoundary>
            )}
          </div>

          {/* Terminal */}
          {panels.terminal.open && (
            <>
              <ErrorBoundary context="terminal-divider">
                <ResizableDivider direction="horizontal" onResize={(d) => setTerminalHeight(panels.terminal.height - d)} />
              </ErrorBoundary>
              <ErrorBoundary context="terminal">
                <div style={{ height: panels.terminal.height, flexShrink: 0 }}>
                  <TerminalPanel workspaceRoot={workspaceRoot} height={panels.terminal.height} />
                </div>
              </ErrorBoundary>
            </>
          )}
        </div>

        {/* Right panel: Chat or other views */}
        {panels.chat.open && currentView === 'chat' && (
          <>
            <ErrorBoundary context="chat-divider">
              <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('chat', panels.chat.width + d)} />
            </ErrorBoundary>
            <ErrorBoundary context="chat">
              <div style={{ width: panels.chat.width, flexShrink: 0 }}>
                <ChatView
                  session={activeSession}
                  messages={messages}
                  onSendMessage={handleSendMessage}
                  onSaveMessages={handleSaveMessages}
                  isLoading={isLoading}
                  onCancel={handleCancel}
                  streamingContent={streamingContent}
                  activeToolCalls={toolCalls}
                  contextWindow={contextWindow}
                  initialMessage={pendingChatMessage}
                  onMessageSent={() => setPendingChatMessage('')}
                />
              </div>
            </ErrorBoundary>
          </>
        )}

        {/* Other panels */}
        {panels.search.open && (
          <Suspense fallback={<div style={{ width: panels.search.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>Loading...</div>}>
            <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('search', panels.search.width + d)} />
            <div style={{ width: panels.search.width, flexShrink: 0 }}>
              <SearchPanel />
            </div>
          </Suspense>
        )}

        {panels.orchestrator.open && (
          <Suspense fallback={<div style={{ width: panels.orchestrator.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>Loading...</div>}>
            <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('orchestrator', panels.orchestrator.width + d)} />
            <div style={{ width: panels.orchestrator.width, flexShrink: 0 }}>
              <OrchestratorView />
            </div>
          </Suspense>
        )}

        {panels.computerUse.open && (
          <Suspense fallback={<div style={{ width: panels.computerUse.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>Loading...</div>}>
            <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('computerUse', panels.computerUse.width + d)} />
            <div style={{ width: panels.computerUse.width, flexShrink: 0 }}>
              <ComputerUseView />
            </div>
          </Suspense>
        )}

        {panels.memoryBrowser.open && (
          <Suspense fallback={<div style={{ width: panels.memoryBrowser.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>Loading...</div>}>
            <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('memoryBrowser', panels.memoryBrowser.width + d)} />
            <div style={{ width: panels.memoryBrowser.width, flexShrink: 0 }}>
              <MemoryBrowser />
            </div>
          </Suspense>
        )}

        {panels.tokenDashboard.open && (
          <Suspense fallback={<div style={{ width: panels.tokenDashboard.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-surface-variant)' }}>Loading...</div>}>
            <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('tokenDashboard', panels.tokenDashboard.width + d)} />
            <div style={{ width: panels.tokenDashboard.width, flexShrink: 0 }}>
              <TokenDashboard />
            </div>
          </Suspense>
        )}
      </main>

      {/* Tool Call Inspector */}
      {showToolInspector && (
        <ToolCallInspector
          toolCalls={toolCalls}
          onClose={() => setShowToolInspector(false)}
        />
      )}

      {/* New Session Dialog */}
      {showNewSessionDialog && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowNewSessionDialog(false)}
        >
          <div
            style={{
              backgroundColor: 'var(--surface-container)',
              border: '1px solid var(--outline-variant)',
              borderRadius: 8,
              padding: 24,
              minWidth: 400,
              maxWidth: 500,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 20px', fontSize: 18, color: 'var(--on-surface)' }}>New Session</h2>

            <label style={{ display: 'block', marginBottom: 6, color: 'var(--on-surface-variant)', fontSize: 13 }}>
              Provider
            </label>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value)
                const p = providers.find((pr) => pr.id === e.target.value)
                if (p?.models[0]) setSelectedModel(p.models[0].id)
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--surface-lowest)',
                color: 'var(--on-surface)',
                border: '1px solid var(--outline-variant)',
                borderRadius: 4,
                marginBottom: 16,
                fontSize: 14,
              }}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <label style={{ display: 'block', marginBottom: 6, color: 'var(--on-surface-variant)', fontSize: 13 }}>
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: 'var(--surface-lowest)',
                color: 'var(--on-surface)',
                border: '1px solid var(--outline-variant)',
                borderRadius: 4,
                marginBottom: 24,
                fontSize: 14,
              }}
            >
              {providers
                .find((p) => p.id === selectedProvider)
                ?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowNewSessionDialog(false)}
                style={{
                  padding: '8px 20px',
                  backgroundColor: 'transparent',
                  color: 'var(--on-surface-variant)',
                  border: '1px solid var(--outline-variant)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmNewSession}
                disabled={!selectedProvider || !selectedModel}
                style={{
                  padding: '8px 20px',
                  background: 'linear-gradient(135deg, var(--primary-container) 0%, var(--primary) 100%)',
                  color: 'var(--on-primary-fixed)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: selectedProvider && selectedModel ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                  opacity: selectedProvider && selectedModel ? 1 : 0.5,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Notification */}
      <UpdateNotification />
    </div>
  )
}
