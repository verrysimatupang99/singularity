import { useState, useEffect, useCallback } from 'react'
import { Session, ChatMessage, ProviderInfo, PROVIDERS, ToolCall, StreamChunk } from './types'
import Sidebar from './components/Sidebar'
import ChatView from './components/ChatView'
import SettingsView from './components/SettingsView'
import ToolCallInspector from './components/ToolCallInspector'

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

  // Load initial data
  useEffect(() => {
    loadSessions()
    loadSettings()
    setupChatChunkListener()
    setupCliStreamListener()
  }, [])

  // Refresh provider status when settings change
  useEffect(() => {
    loadProviderStatus()
  }, [settings])

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
            }
            setMessages((prev) => [...prev, assistantMsg])
            setStreamingContent(null)
          }
        }
      }
    })
    return cleanup
  }, [activeRequestId])

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
    async (content: string) => {
      const activeSession = sessions.find((s) => s.id === activeSessionId)
      if (!activeSession) return

      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
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

  return (
    <div
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
      {/* Sidebar */}
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
      />

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {currentView === 'chat' ? (
          <ChatView
            session={activeSession}
            messages={messages}
            onSendMessage={handleSendMessage}
            onSaveMessages={handleSaveMessages}
            isLoading={isLoading}
            onCancel={handleCancel}
            streamingContent={streamingContent}
            activeToolCalls={toolCalls}
          />
        ) : (
          <SettingsView
            settings={settings}
            providers={providers}
            onSaveSettings={handleSaveSettings}
            onSetApiKey={handleSetApiKey}
            onDeleteApiKey={handleDeleteApiKey}
            onBack={() => setCurrentView('chat')}
          />
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
    </div>
  )
}
