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

  // Pending chat message (from editor "Ask AI")
  const [pendingChatMessage, setPendingChatMessage] = useState<string>('')

  // Onboarding
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Load initial data
  useEffect(() => {
    loadSessions()
    loadSettings()
    setupChatChunkListener()
    setupCliStreamListener()
    checkOnboarding()
  }, [])

  // Refresh provider status when settings change
  useEffect(() => {
    loadProviderStatus()
  }, [settings])

  // Update session token totals when messages change
  useEffect(() => {
    if (activeSessionId) {
      const total = messages.reduce((sum, msg) => {
        if (msg.tokenUsage?.totalTokens) {
          return sum + msg.tokenUsage.totalTokens
        }
        return sum
      }, 0)
      setSessionTokenTotals((prev) => ({ ...prev, [activeSessionId]: total }))
    }
  }, [messages, activeSessionId])

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
      const [status, registryProviders] = await Promise.all([
        window.api.authStatus(),
        window.api.providersList(),
      ])

      const providerInfos: ProviderInfo[] = PROVIDERS.map((p) => {
        const registryProvider = registryProviders.find((r) => r.id === p.id)
        return {
          id: p.id,
          name: registryProvider?.name ?? p.name,
          icon: p.id,
          status: status[p.id]?.status === 'connected' ? 'connected' : 'disconnected',
          models: registryProvider?.models?.length
            ? registryProvider.models.map((m) => ({ id: m.id, name: m.name }))
            : (status[p.id]?.models || p.models).map((m: string) => ({ id: m, name: m })),
        }
      })
      setProviders(providerInfos)
    } catch (err) {
      console.error('Failed to load provider status:', err)
    }
  }, [])

  const checkOnboarding = useCallback(async () => {
    try {
      const isFirst = await window.api.storageIsFirstRun()
      if (isFirst) setShowOnboarding(true)
    } catch {
      // Ignore errors
    }
  }, [])

  const setupChatChunkListener = useCallback(() => {
    const cleanup = window.api.onChatChunk((data) => {
      if (data.requestId === activeRequestId) {
        setStreamingContent(data.content)
        if (data.done) {
          setIsLoading(false)
          setActiveRequestId(null)
          // Add the final assistant message
          if (data.content) {
            const assistantMsg: ChatMessage = {
              id: `msg_${Date.now()}`,
              role: 'assistant',
              content: data.content,
              timestamp: Date.now(),
              tokenUsage: data.usage,
              model: sessions.find((s) => s.id === activeSessionId)?.model,
              provider: sessions.find((s) => s.id === activeSessionId)?.provider,
            }
            setMessages((prev) => [...prev, assistantMsg])
            setStreamingContent(null)
          }
        }
      }
    })
    return cleanup
  }, [activeRequestId, activeSessionId, sessions])

  const setupCliStreamListener = useCallback(() => {
    const cleanup = window.api.onCliStream((data) => {
      const chunk = data.chunk as StreamChunk

      if (chunk.type === 'tool_call' && chunk.toolCall) {
        const newToolCall: ToolCall = {
          id: chunk.toolCall.id,
          name: chunk.toolCall.kind,
          args: chunk.toolCall.args || {},
          status: 'pending',
          timestamp: Date.now(),
        }
        setToolCalls((prev) => [...prev, newToolCall])
      } else if (chunk.type === 'end_turn') {
        // Mark all pending/executing tool calls as completed
        setToolCalls((prev) =>
          prev.map((tc) =>
            tc.status === 'pending' || tc.status === 'executing'
              ? { ...tc, status: chunk.stopReason === 'error' ? 'failed' as const : 'completed' as const, result: chunk.errorMessage }
              : tc,
          ),
        )
      }
    })
    return cleanup
  }, [])

  // Handle session selection
  const handleSelectSession = useCallback(async (id: string) => {
    setActiveSessionId(id)
    setCurrentView('chat')
    setStreamingContent(null)
    setIsLoading(false)
    setToolCalls([]) // Clear tool calls on session switch
    try {
      const { session, messages: msgs } = await window.api.sessionLoad(id)
      setMessages(msgs)
    } catch (err) {
      console.error('Failed to load session:', err)
      setMessages([])
    }
  }, [])

  // Create new session — show provider/model selection dialog
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
          setStreamingContent(null)
          setIsLoading(false)
          setToolCalls([])
        }
      } catch (err) {
        console.error('Failed to delete session:', err)
      }
    },
    [activeSessionId],
  )

  // Send message
  const handleSendMessage = useCallback(
    async (content: string, attachments?: Attachment[]) => {
      const activeSession = sessions.find((s) => s.id === activeSessionId)
      if (!activeSession) return

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
        attachments,
      }
      const newMessages = [...messages, userMsg]
      setMessages(newMessages)
      setStreamingContent(null)
      setIsLoading(true)

      try {
        const requestId = await window.api.chatSend(
          activeSession.provider,
          activeSession.model,
          newMessages,
        )
        setActiveRequestId(requestId)
      } catch (err) {
        console.error('Failed to send message:', err)
        setIsLoading(false)
        setStreamingContent(null)
        const errorMsg: ChatMessage = {
          id: `msg_${Date.now()}`,
          role: 'system',
          content: `Error: ${err instanceof Error ? err.message : String(err)}`,
          timestamp: Date.now(),
        }
        setMessages((prev) => [...prev, errorMsg])
      }
    },
    [activeSessionId, sessions, messages],
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

  // Cancel streaming
  const handleCancel = useCallback(() => {
    if (activeRequestId) {
      window.api.chatCancel(activeRequestId)
      setIsLoading(false)
      setActiveRequestId(null)
      setStreamingContent(null)
    }
  }, [activeRequestId])

  // Handle "Ask AI" from editor
  const handleEditorAskAI = useCallback((context: { file: string; content: string; selection?: string }) => {
    setCurrentView('chat')
    if (!panels.chat.open) togglePanel('chat')
    if (!panels.editor.open) togglePanel('editor')

    const fileName = context.file.split('/').at(-1) || context.file
    const ext = context.file.split('.').at(-1) || ''
    const prefix = context.selection
      ? `Here's a selection from \`${fileName}\`:\n\n\`\`\`${ext}\n${context.selection}\n\`\`\``
      : `Here's the content of \`${fileName}\`:\n\n\`\`\`${ext}\n${context.content}\n\`\`\``

    setPendingChatMessage(prefix + '\n\n')
  }, [togglePanel, panels])

  // Settings handlers
  const handleSaveSettings = useCallback(
    async (updates: Partial<AppSettings>) => {
      try {
        await window.api.settingsSet(updates)
        setSettings((prev) => (prev ? { ...prev, ...updates } : prev))
      } catch (err) {
        console.error('Failed to save settings:', err)
      }
    },
    [],
  )

  const handleSetApiKey = useCallback(async (provider: string, key: string) => {
    try {
      return await window.api.authSetApiKey(provider, key)
    } catch (err) {
      console.error('Failed to set API key:', err)
      return false
    }
  }, [])

  const handleDeleteApiKey = useCallback(async (provider: string) => {
    try {
      await window.api.authDeleteApiKey(provider)
    } catch (err) {
      console.error('Failed to delete API key:', err)
    }
  }, [])

  const activeSession = sessions.find((s) => s.id === activeSessionId) || null
  const pendingToolCallCount = toolCalls.filter((t) => t.status === 'pending').length

  // Compute context window for the active session
  const contextWindow = useMemo(() => {
    if (!activeSession) return undefined
    const providerInfo = providers.find((p) => p.id === activeSession.provider)
    if (!providerInfo) return undefined
    const modelInfo = providerInfo.models.find((m) => m.id === activeSession.model)
    return modelInfo?.contextWindow
  }, [activeSession, providers])

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

  return (
    <div
      className="ide-root"
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        backgroundColor: '#0d1117',
        color: '#c9d1d9',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        margin: 0,
        padding: 0,
        overflow: 'hidden',
      }}
    >
      {/* Onboarding Wizard */}
      {showOnboarding && (
        <OnboardingWizard
          onComplete={() => setShowOnboarding(false)}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

      {/* Activity Bar */}
      <ActivityBar />

      {/* Sidebar */}
      {panels.sidebar.open && (
        <div style={{ width: panels.sidebar.width, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid #21262d' }}>
          <Sidebar
            sessions={sessions}
            activeSessionId={activeSessionId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            onDeleteSession={handleDeleteSession}
            onOpenSettings={() => setCurrentView('settings')}
            providers={providers}
            onToggleToolInspector={() => setShowToolInspector((prev) => !prev)}
            showToolInspector={showToolInspector}
            pendingToolCallCount={pendingToolCallCount}
            sessionTokenTotals={sessionTokenTotals}
          />
        </div>
      )}
      {panels.sidebar.open && (
        <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('sidebar', panels.sidebar.width + d)} />
      )}

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* File Tree */}
          {panels.fileTree.open && workspaceRoot && (
            <>
              <div style={{ width: panels.fileTree.width, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid #21262d' }}>
                <ErrorBoundary context="FileTree">
                  <FileTree rootPath={workspaceRoot} onFileOpen={openFile} activeFile={activeFile} />
                </ErrorBoundary>
              </div>
              <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('fileTree', panels.fileTree.width + d)} />
            </>
          )}

          {/* Search Panel */}
          {panels.search.open && (
            <>
              <div style={{ width: panels.search.width, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid #21262d' }}>
                <ErrorBoundary context="SearchPanel">
                  <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>Loading...</div>}>
                    <SearchPanel />
                  </Suspense>
                </ErrorBoundary>
              </div>
              <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('search', panels.search.width + d)} />
            </>
          )}

          {/* Agent Panel */}
          {panels.agent.open && (
            <>
              <div style={{ width: panels.agent.width, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid #21262d' }}>
                <ErrorBoundary context="AgentView">
                  <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>Loading...</div>}>
                    <AgentView workspaceRoot={workspaceRoot} />
                  </Suspense>
                </ErrorBoundary>
              </div>
              <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('agent', panels.agent.width + d)} />
            </>
          )}

          {/* Orchestrator Panel */}
          {panels.orchestrator.open && (
            <>
              <div style={{ width: panels.orchestrator.width, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid #21262d' }}>
                <ErrorBoundary context="OrchestratorView">
                  <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>Loading...</div>}>
                    <OrchestratorView />
                  </Suspense>
                </ErrorBoundary>
              </div>
              <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('orchestrator', panels.orchestrator.width + d)} />
            </>
          )}

          {/* Computer Use Panel */}
          {panels.computerUse.open && (
            <>
              <div style={{ width: panels.computerUse.width, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid #21262d' }}>
                <ErrorBoundary context="ComputerUseView">
                  <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>Loading...</div>}>
                    <ComputerUseView />
                  </Suspense>
                </ErrorBoundary>
              </div>
              <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('computerUse', panels.computerUse.width + d)} />
            </>
          )}

          {/* Memory Browser Panel */}
          {panels.memoryBrowser.open && (
            <>
              <div style={{ width: panels.memoryBrowser.width, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid #21262d' }}>
                <ErrorBoundary context="MemoryBrowser">
                  <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>Loading...</div>}>
                    <MemoryBrowser />
                  </Suspense>
                </ErrorBoundary>
              </div>
              <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('memoryBrowser' as any, panels.memoryBrowser.width + d)} />
            </>
          )}

          {/* Token Dashboard Panel */}
          {panels.tokenDashboard.open && (
            <>
              <div style={{ width: panels.tokenDashboard.width, flexShrink: 0, overflow: 'hidden', borderRight: '1px solid #21262d' }}>
                <ErrorBoundary context="TokenDashboard">
                  <Suspense fallback={<div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>Loading...</div>}>
                    <TokenDashboard />
                  </Suspense>
                </ErrorBoundary>
              </div>
              <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('tokenDashboard' as any, panels.tokenDashboard.width + d)} />
            </>
          )}

          {/* Center: Editor if file open, otherwise Chat or Settings */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            {panels.editor.open && activeFile ? (
              <>
                <EditorTabBar />
                <ErrorBoundary context="CodeEditor">
                  <CodeEditor
                    filePath={activeFile}
                    provider={activeSession?.provider || settings?.defaultProvider || 'openai'}
                    model={activeSession?.model || settings?.defaultModel || 'gpt-4'}
                    onAskAI={handleEditorAskAI}
                  />
                </ErrorBoundary>
              </>
            ) : currentView === 'chat' ? (
              <ErrorBoundary context="ChatView">
                <ChatView
                  session={activeSession}
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
              </ErrorBoundary>
            ) : (
              <ErrorBoundary context="SettingsView">
                <SettingsView
                  settings={settings}
                  providers={providers}
                  onSaveSettings={handleSaveSettings}
                  onSetApiKey={handleSetApiKey}
                  onDeleteApiKey={handleDeleteApiKey}
                  onBack={() => setCurrentView('chat')}
                />
              </ErrorBoundary>
            )}
          </div>

          {/* Chat panel (when editor is not active) */}
          {panels.chat.open && !panels.editor.open && (
            <>
              <ResizableDivider direction="vertical" onResize={(d) => setPanelWidth('chat', panels.chat.width + d)} />
              <div style={{ width: panels.chat.width, flexShrink: 0 }}>
                {currentView === 'chat' ? (
                  <ErrorBoundary context="ChatView">
                    <ChatView
                      session={activeSession}
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
                  </ErrorBoundary>
                ) : (
                  <ErrorBoundary context="SettingsView">
                    <SettingsView
                      settings={settings}
                      providers={providers}
                      onSaveSettings={handleSaveSettings}
                      onSetApiKey={handleSetApiKey}
                      onDeleteApiKey={handleDeleteApiKey}
                      onBack={() => setCurrentView('chat')}
                    />
                  </ErrorBoundary>
                )}
              </div>
            </>
          )}
        </div>

        {/* Terminal Panel */}
        {panels.terminal.open && (
          <>
            <ResizableDivider direction="horizontal" onResize={(d) => setTerminalHeight(panels.terminal.height - d)} />
            <div style={{ height: panels.terminal.height, flexShrink: 0 }}>
              <ErrorBoundary context="TerminalPanel">
                <TerminalPanel workspaceRoot={workspaceRoot} />
              </ErrorBoundary>
            </div>
          </>
        )}
      </div>

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
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: 12,
              padding: 24,
              minWidth: 400,
              maxWidth: 500,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 20px', fontSize: 18, color: '#f0f6fc' }}>New Session</h2>

            <label style={{ display: 'block', marginBottom: 6, color: '#8b949e', fontSize: 13 }}>
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
                backgroundColor: '#0d1117',
                color: '#c9d1d9',
                border: '1px solid #30363d',
                borderRadius: 6,
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

            <label style={{ display: 'block', marginBottom: 6, color: '#8b949e', fontSize: 13 }}>
              Model
            </label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                backgroundColor: '#0d1117',
                color: '#c9d1d9',
                border: '1px solid #30363d',
                borderRadius: 6,
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
                  color: '#8b949e',
                  border: '1px solid #30363d',
                  borderRadius: 6,
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
                  backgroundColor: '#238636',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: selectedProvider && selectedModel ? 'pointer' : 'not-allowed',
                  fontSize: 14,
                  opacity: selectedProvider && selectedModel ? 1 : 0.5,
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-Updater Notification */}
      <UpdateNotification />
    </div>
  )
}
