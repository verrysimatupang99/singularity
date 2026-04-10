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

  // Create new session
  const handleNewSession = useCallback(async () => {
    const defaultProvider = settings?.defaultProvider || 'openai'
    const defaultModel = settings?.defaultModel || 'gpt-4o'

    const providerInfo = providers.find((p) => p.id === defaultProvider)
    const model = providerInfo?.models[0]?.id || defaultModel

    try {
      const session = await window.api.sessionCreate({
        provider: defaultProvider,
        model,
      })
      setSessions((prev) => [session, ...prev])
      handleSelectSession(session.id)
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }, [settings, providers, handleSelectSession])

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
    </div>
  )
}
