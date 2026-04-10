import { useState, useEffect, useCallback } from 'react'
import { AppSettings, ProviderInfo, McpServerInfo, McpServerConfig, McpTool, GithubDeviceAuthResult } from '../types'

interface SettingsViewProps {
  settings: AppSettings | null
  providers: ProviderInfo[]
  onSaveSettings: (settings: Partial<AppSettings>) => void
  onSetApiKey: (provider: string, key: string) => Promise<boolean>
  onDeleteApiKey: (provider: string) => Promise<void>
  onBack: () => void
}

const PROVIDER_CONFIG = [
  { id: 'gemini', name: 'Google Gemini', color: '#4285f4', keyLabel: 'API Key' },
  { id: 'copilot', name: 'GitHub Copilot', color: '#24292e', keyLabel: 'OAuth Token' },
  { id: 'qwen', name: 'Qwen', color: '#615ef0', keyLabel: 'API Key' },
  { id: 'anthropic', name: 'Anthropic', color: '#d46f2f', keyLabel: 'API Key' },
  { id: 'openai', name: 'OpenAI', color: '#10a37f', keyLabel: 'API Key' },
  { id: 'openrouter', name: 'OpenRouter', color: '#3b82f6', keyLabel: 'API Key' },
]

export default function SettingsView({
  settings,
  providers,
  onSaveSettings,
  onSetApiKey,
  onDeleteApiKey,
  onBack,
}: SettingsViewProps) {
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  // MCP state
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([])
  const [showAddMcp, setShowAddMcp] = useState(false)
  const [newMcpName, setNewMcpName] = useState('')
  const [newMcpCommand, setNewMcpCommand] = useState('')
  const [newMcpArgs, setNewMcpArgs] = useState('')
  const [newMcpTimeout, setNewMcpTimeout] = useState('10000')
  const [mcpLoading, setMcpLoading] = useState<Set<string>>(new Set())
  const [expandedMcpServer, setExpandedMcpServer] = useState<string | null>(null)

  // OAuth state
  const [githubAuthStatus, setGithubAuthStatus] = useState<'idle' | 'pending' | 'complete' | 'error'>('idle')
  const [githubUserCode, setGithubUserCode] = useState('')
  const [githubVerifyUri, setGithubVerifyUri] = useState('')
  const [githubAuthError, setGithubAuthError] = useState('')
  const [qwenAuthStatus, setQwenAuthStatus] = useState<'idle' | 'pending' | 'complete' | 'error'>('idle')
  const [qwenUserCode, setQwenUserCode] = useState('')
  const [qwenVerifyUri, setQwenVerifyUri] = useState('')
  const [qwenAuthError, setQwenAuthError] = useState('')
  const [googleAuthStatus, setGoogleAuthStatus] = useState<'idle' | 'pending' | 'complete' | 'error'>('idle')
  const [googleAuthError, setGoogleAuthError] = useState('')
  const [geminiImportStatus, setGeminiImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [geminiImportError, setGeminiImportError] = useState('')

  const theme = settings?.theme || 'dark'
  const defaultProvider = settings?.defaultProvider || 'openai'
  const defaultModel = settings?.defaultModel || 'gpt-4o'

  // Load MCP servers on mount
  useEffect(() => {
    loadMcpServers()
  }, [])

  const loadMcpServers = useCallback(async () => {
    try {
      const list = await window.api.mcpList()
      setMcpServers(list)
    } catch (err) {
      console.error('Failed to load MCP servers:', err)
    }
  }, [])

  const handleStartMcp = useCallback(async (name: string) => {
    setMcpLoading((prev) => new Set(prev).add(name))
    try {
      await window.api.mcpStart(name)
      setFeedback(`MCP server "${name}" started`)
    } catch (err) {
      setFeedback(`Failed to start "${name}": ${err instanceof Error ? err.message : String(err)}`)
    }
    setMcpLoading((prev) => {
      const next = new Set(prev)
      next.delete(name)
      return next
    })
    setTimeout(() => setFeedback(null), 3000)
    await loadMcpServers()
  }, [loadMcpServers])

  const handleStopMcp = useCallback(async (name: string) => {
    setMcpLoading((prev) => new Set(prev).add(name))
    try {
      await window.api.mcpStop(name)
      setFeedback(`MCP server "${name}" stopped`)
    } catch (err) {
      setFeedback(`Failed to stop "${name}": ${err instanceof Error ? err.message : String(err)}`)
    }
    setMcpLoading((prev) => {
      const next = new Set(prev)
      next.delete(name)
      return next
    })
    setTimeout(() => setFeedback(null), 3000)
    await loadMcpServers()
  }, [loadMcpServers])

  const handleRemoveMcp = useCallback(async (name: string) => {
    try {
      await window.api.mcpRemove(name)
      setFeedback(`MCP server "${name}" removed`)
    } catch (err) {
      setFeedback(`Failed to remove "${name}": ${err instanceof Error ? err.message : String(err)}`)
    }
    setTimeout(() => setFeedback(null), 3000)
    await loadMcpServers()
  }, [loadMcpServers])

  const handleAddMcp = useCallback(async () => {
    if (!newMcpName.trim() || !newMcpCommand.trim()) {
      setFeedback('Server name and command are required')
      setTimeout(() => setFeedback(null), 3000)
      return
    }
    const args = newMcpArgs.split(' ').filter(Boolean)
    const config: McpServerConfig = {
      command: newMcpCommand.trim(),
      args,
      timeout: parseInt(newMcpTimeout, 10) || 10000,
    }
    try {
      await window.api.mcpAdd(newMcpName.trim(), config)
      setFeedback(`MCP server "${newMcpName}" added`)
      setNewMcpName('')
      setNewMcpCommand('')
      setNewMcpArgs('')
      setNewMcpTimeout('10000')
      setShowAddMcp(false)
    } catch (err) {
      setFeedback(`Failed to add MCP server: ${err instanceof Error ? err.message : String(err)}`)
    }
    setTimeout(() => setFeedback(null), 3000)
    await loadMcpServers()
  }, [newMcpName, newMcpCommand, newMcpArgs, newMcpTimeout, loadMcpServers])

  // -----------------------------------------------------------------------
  // OAuth handlers
  // -----------------------------------------------------------------------

  const handleGithubAuthStart = useCallback(async () => {
    setGithubAuthStatus('pending')
    setGithubAuthError('')
    try {
      const result = await window.api.authGithubDevice()
      if (result.status === 'pending') {
        setGithubUserCode(result.userCode)
        setGithubVerifyUri(result.verificationUri)
        // Open browser
        const { shell } = await import('electron')
        // In renderer, use window.open or instruct user
        window.open(result.verificationUri, '_blank')
        // Start polling
        startGithubPolling(result.interval)
      } else if (result.status === 'error') {
        setGithubAuthStatus('error')
        setGithubAuthError(result.error)
      }
    } catch (err) {
      setGithubAuthStatus('error')
      setGithubAuthError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const startGithubPolling = useCallback((intervalMs: number) => {
    const poll = async () => {
      try {
        const result = await window.api.authGithubPoll()
        if (result.status === 'complete') {
          setGithubAuthStatus('complete')
          setFeedback('GitHub Copilot authenticated successfully!')
          setTimeout(() => setFeedback(null), 3000)
          return
        }
        if (result.status === 'error') {
          setGithubAuthStatus('error')
          setGithubAuthError(result.error)
          return
        }
        // Still pending — poll again
        setTimeout(poll, (intervalMs || 5) * 1000)
      } catch (err) {
        setGithubAuthStatus('error')
        setGithubAuthError(err instanceof Error ? err.message : String(err))
      }
    }
    setTimeout(poll, intervalMs * 1000)
  }, [])

  const handleQwenAuthStart = useCallback(async () => {
    setQwenAuthStatus('pending')
    setQwenAuthError('')
    try {
      const result = await window.api.authQwenDevice()
      if (result.status === 'pending') {
        setQwenUserCode(result.userCode)
        setQwenVerifyUri(result.verificationUri)
        window.open(result.verificationUri, '_blank')
        startQwenPolling(result.interval)
      } else if (result.status === 'error') {
        setQwenAuthStatus('error')
        setQwenAuthError(result.error)
      }
    } catch (err) {
      setQwenAuthStatus('error')
      setQwenAuthError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const startQwenPolling = useCallback((intervalMs: number) => {
    const poll = async () => {
      try {
        const result = await window.api.authQwenPoll()
        if (result.status === 'complete') {
          setQwenAuthStatus('complete')
          setFeedback('Qwen authenticated successfully!')
          setTimeout(() => setFeedback(null), 3000)
          return
        }
        if (result.status === 'error') {
          setQwenAuthStatus('error')
          setQwenAuthError(result.error)
          return
        }
        setTimeout(poll, (intervalMs || 5) * 1000)
      } catch (err) {
        setQwenAuthStatus('error')
        setQwenAuthError(err instanceof Error ? err.message : String(err))
      }
    }
    setTimeout(poll, intervalMs * 1000)
  }, [])

  const handleGoogleAuthStart = useCallback(async () => {
    setGoogleAuthStatus('pending')
    setGoogleAuthError('')
    try {
      const result = await window.api.authGoogleOAuth(true)
      if (result.status === 'pending') {
        window.open(result.authUrl, '_blank')
        // The promise resolves when the callback receives tokens
        const tokenResult = await window.api.authGoogleOAuth(false, 0)
        if (tokenResult.status === 'complete') {
          setGoogleAuthStatus('complete')
          setFeedback('Google OAuth authenticated successfully!')
          setTimeout(() => setFeedback(null), 3000)
        } else if (tokenResult.status === 'error') {
          setGoogleAuthStatus('error')
          setGoogleAuthError(tokenResult.error || 'Unknown error')
        }
      } else if (result.status === 'error') {
        setGoogleAuthStatus('error')
        setGoogleAuthError(result.error)
      }
    } catch (err) {
      setGoogleAuthStatus('error')
      setGoogleAuthError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const handleGeminiImport = useCallback(async () => {
    setGeminiImportStatus('idle')
    setGeminiImportError('')
    try {
      const result = await window.api.authImportGemini()
      if (result.success) {
        setGeminiImportStatus('success')
        setFeedback('Gemini CLI credentials imported successfully!')
        setTimeout(() => setFeedback(null), 3000)
      } else {
        setGeminiImportStatus('error')
        setGeminiImportError(result.error || 'Unknown error')
      }
    } catch (err) {
      setGeminiImportStatus('error')
      setGeminiImportError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const handleSaveKey = async (providerId: string) => {
    const key = apiKeyInputs[providerId]
    if (!key || key.length < 4) return
    setSavingKey(providerId)
    const success = await onSetApiKey(providerId, key)
    setSavingKey(null)
    if (success) {
      setApiKeyInputs((prev) => ({ ...prev, [providerId]: '' }))
      setFeedback(`API key saved for ${providerId}`)
    } else {
      setFeedback(`Failed to save API key for ${providerId}`)
    }
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleDeleteKey = async (providerId: string) => {
    await onDeleteApiKey(providerId)
    setFeedback(`API key removed for ${providerId}`)
    setTimeout(() => setFeedback(null), 3000)
  }

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    onSaveSettings({ theme: newTheme })
  }

  const handleDefaultProviderChange = (provider: string) => {
    onSaveSettings({ defaultProvider: provider })
  }

  const providerStatus = providers.reduce<Record<string, string>>((acc, p) => {
    acc[p.id] = p.status
    return acc
  }, {})

  const statusColor = (status: string) => {
    switch (status) {
      case 'running': return '#3fb950'
      case 'starting': return '#d29922'
      case 'error': return '#f85149'
      default: return '#484f58'
    }
  }

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        backgroundColor: '#0d1117',
        color: '#c9d1d9',
        padding: '32px 40px',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <button
          onClick={onBack}
          style={{
            backgroundColor: '#21262d',
            border: '1px solid #30363d',
            color: '#8b949e',
            padding: '6px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
          }}
        >
          &larr; Back
        </button>
        <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700 }}>Settings</h1>
      </div>

      {feedback && (
        <div
          style={{
            padding: '10px 16px',
            marginBottom: '20px',
            borderRadius: '8px',
            backgroundColor: feedback.includes('Failed') || feedback.includes('Error') || feedback.includes('error')
              ? 'rgba(248, 81, 73, 0.15)'
              : 'rgba(63, 185, 80, 0.15)',
            border: `1px solid ${feedback.includes('Failed') || feedback.includes('Error') || feedback.includes('error') ? 'rgba(248, 81, 73, 0.3)' : 'rgba(63, 185, 80, 0.3)'}`,
            color: feedback.includes('Failed') || feedback.includes('Error') || feedback.includes('error') ? '#f85149' : '#3fb950',
            fontSize: '0.85rem',
          }}
        >
          {feedback}
        </div>
      )}

      {/* Provider Connections */}
      <Section title="Provider Connections">
        {PROVIDER_CONFIG.map((config) => {
          const status = providerStatus[config.id] || 'disconnected'
          const hasKey = status === 'connected'

          return (
            <div
              key={config.id}
              style={{
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '10px',
                padding: '16px 20px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  backgroundColor: hasKey ? '#3fb950' : '#484f58',
                  boxShadow: hasKey ? '0 0 6px #3fb950' : 'none',
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: config.color }}>
                  {config.name}
                </div>
                <div style={{ fontSize: '0.8rem', color: '#484f58', marginTop: '2px' }}>
                  {hasKey ? 'Connected' : 'Not configured'}
                </div>
              </div>
              {hasKey ? (
                <button
                  onClick={() => handleDeleteKey(config.id)}
                  style={{
                    backgroundColor: 'rgba(248, 81, 73, 0.15)',
                    border: '1px solid rgba(248, 81, 73, 0.3)',
                    color: '#f85149',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Remove Key
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="password"
                    placeholder={`Enter ${config.keyLabel}`}
                    value={apiKeyInputs[config.id] || ''}
                    onChange={(e) =>
                      setApiKeyInputs((prev) => ({
                        ...prev,
                        [config.id]: e.target.value,
                      }))
                    }
                    style={{
                      backgroundColor: '#0d1117',
                      border: '1px solid #30363d',
                      borderRadius: '6px',
                      color: '#c9d1d9',
                      padding: '6px 10px',
                      fontSize: '0.85rem',
                      width: '200px',
                      outline: 'none',
                    }}
                  />
                  <button
                    onClick={() => handleSaveKey(config.id)}
                    disabled={!apiKeyInputs[config.id] || savingKey === config.id}
                    style={{
                      backgroundColor:
                        apiKeyInputs[config.id] && savingKey !== config.id
                          ? '#238636'
                          : '#21262d',
                      border: '1px solid #30363d',
                      color:
                        apiKeyInputs[config.id] && savingKey !== config.id
                          ? '#fff'
                          : '#484f58',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      cursor:
                        apiKeyInputs[config.id] && savingKey !== config.id
                          ? 'pointer'
                          : 'not-allowed',
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {savingKey === config.id ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </Section>

      {/* OAuth Connections */}
      <Section title="OAuth Connections">
        <div style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: '16px' }}>
          Connect providers using OAuth device flow or import existing credentials.
        </div>

        {/* GitHub Copilot */}
        <OAuthCard
          providerName="GitHub Copilot"
          color="#24292e"
          status={githubAuthStatus}
          error={githubAuthError}
          userCode={githubUserCode}
          verifyUri={githubVerifyUri}
          onConnect={handleGithubAuthStart}
          providerLabel="GitHub"
        />

        {/* Qwen */}
        <OAuthCard
          providerName="Qwen / DashScope"
          color="#615ef0"
          status={qwenAuthStatus}
          error={qwenAuthError}
          userCode={qwenUserCode}
          verifyUri={qwenVerifyUri}
          onConnect={handleQwenAuthStart}
          providerLabel="Qwen"
        />

        {/* Google OAuth */}
        <div
          style={{
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: googleAuthStatus === 'complete' ? '#3fb950' : '#484f58',
              boxShadow: googleAuthStatus === 'complete' ? '0 0 6px #3fb950' : 'none',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#4285f4' }}>
              Google (PKCE)
            </div>
            <div style={{ fontSize: '0.8rem', color: '#484f58', marginTop: '2px' }}>
              {googleAuthStatus === 'complete'
                ? 'Connected'
                : googleAuthStatus === 'pending'
                  ? 'Waiting for browser authorization...'
                  : googleAuthStatus === 'error'
                    ? googleAuthError
                    : 'Not connected'}
            </div>
          </div>
          {(() => {
            const st = googleAuthStatus
            if (st === 'idle' || st === 'error') {
              return (
                <button
                  onClick={handleGoogleAuthStart}
                  style={{
                    backgroundColor: '#238636',
                    border: '1px solid #2ea043',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Connect
                </button>
              )
            }
            if (st === 'pending') {
              return (
                <span style={{ fontSize: '0.8rem', color: '#d29922' }}>
                  Connecting...
                </span>
              )
            }
            return (
              <span style={{ fontSize: '0.8rem', color: '#3fb950' }}>
                \u2705 Connected
              </span>
            )
          })()}
        </div>

        {/* Gemini CLI Import */}
        <div
          style={{
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: geminiImportStatus === 'success' ? '#3fb950' : '#484f58',
              boxShadow: geminiImportStatus === 'success' ? '0 0 6px #3fb950' : 'none',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#4285f4' }}>
              Gemini CLI (Import)
            </div>
            <div style={{ fontSize: '0.8rem', color: '#484f58', marginTop: '2px' }}>
              {geminiImportStatus === 'success'
                ? 'Credentials imported'
                : geminiImportStatus === 'error'
                  ? geminiImportError
                  : 'Import from ~/.gemini/oauth_creds.json'}
            </div>
          </div>
          <button
            onClick={handleGeminiImport}
            style={{
              backgroundColor: '#238636',
              border: '1px solid #2ea043',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              whiteSpace: 'nowrap',
            }}
          >
            Import
          </button>
        </div>
      </Section>

      {/* MCP Servers */}
      <Section title="MCP Servers">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontSize: '0.85rem', color: '#8b949e' }}>
            Manage Model Context Protocol servers that provide tools to AI agents.
          </div>
          <button
            onClick={() => setShowAddMcp(!showAddMcp)}
            style={{
              backgroundColor: showAddMcp ? '#30363d' : '#238636',
              border: '1px solid #30363d',
              color: '#c9d1d9',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              whiteSpace: 'nowrap',
            }}
          >
            {showAddMcp ? 'Cancel' : '+ Add Server'}
          </button>
        </div>

        {/* Add MCP Server form */}
        {showAddMcp && (
          <div
            style={{
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '10px',
              padding: '20px',
              marginBottom: '16px',
            }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '12px' }}>Add MCP Server</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', color: '#8b949e', display: 'block', marginBottom: '4px' }}>
                    Server Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., filesystem"
                    value={newMcpName}
                    onChange={(e) => setNewMcpName(e.target.value)}
                    style={{
                      backgroundColor: '#0d1117',
                      border: '1px solid #30363d',
                      borderRadius: '6px',
                      color: '#c9d1d9',
                      padding: '8px 10px',
                      fontSize: '0.85rem',
                      width: '100%',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', color: '#8b949e', display: 'block', marginBottom: '4px' }}>
                    Command
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., npx"
                    value={newMcpCommand}
                    onChange={(e) => setNewMcpCommand(e.target.value)}
                    style={{
                      backgroundColor: '#0d1117',
                      border: '1px solid #30363d',
                      borderRadius: '6px',
                      color: '#c9d1d9',
                      padding: '8px 10px',
                      fontSize: '0.85rem',
                      width: '100%',
                      boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#8b949e', display: 'block', marginBottom: '4px' }}>
                  Arguments (space-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g., -y @modelcontextprotocol/server-filesystem /path/to/allow"
                  value={newMcpArgs}
                  onChange={(e) => setNewMcpArgs(e.target.value)}
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '8px 10px',
                    fontSize: '0.85rem',
                    width: '100%',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#8b949e', display: 'block', marginBottom: '4px' }}>
                  Timeout (ms)
                </label>
                <input
                  type="number"
                  placeholder="10000"
                  value={newMcpTimeout}
                  onChange={(e) => setNewMcpTimeout(e.target.value)}
                  style={{
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '8px 10px',
                    fontSize: '0.85rem',
                    width: '120px',
                    outline: 'none',
                  }}
                />
              </div>
              <button
                onClick={handleAddMcp}
                style={{
                  backgroundColor: '#238636',
                  border: '1px solid #2ea043',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  alignSelf: 'flex-start',
                }}
              >
                Add Server
              </button>
            </div>
          </div>
        )}

        {/* Server list */}
        {mcpServers.length === 0 && !showAddMcp && (
          <div
            style={{
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '10px',
              padding: '24px',
              textAlign: 'center',
              color: '#484f58',
              fontSize: '0.85rem',
            }}
          >
            No MCP servers configured. Click &quot;+ Add Server&quot; to get started.
          </div>
        )}

        {mcpServers.map((server) => {
          const isLoading = mcpLoading.has(server.name)
          const isExpanded = expandedMcpServer === server.name

          return (
            <div
              key={server.name}
              style={{
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '10px',
                padding: '16px 20px',
                marginBottom: '12px',
              }}
            >
              {/* Server header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Status dot */}
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    backgroundColor: statusColor(server.status),
                    boxShadow: server.status === 'running' ? `0 0 6px ${statusColor(server.status)}` : 'none',
                    flexShrink: 0,
                  }}
                />

                {/* Name */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{server.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#484f58', fontFamily: 'monospace' }}>
                    {server.config.command} {server.config.args.join(' ')}
                  </div>
                </div>

                {/* Status badge */}
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: statusColor(server.status),
                    textTransform: 'capitalize',
                    backgroundColor: `${statusColor(server.status)}15`,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: `1px solid ${statusColor(server.status)}30`,
                  }}
                >
                  {server.status}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px' }}>
                  {server.status === 'running' ? (
                    <button
                      onClick={() => handleStopMcp(server.name)}
                      disabled={isLoading}
                      style={{
                        backgroundColor: 'rgba(210, 153, 34, 0.15)',
                        border: '1px solid rgba(210, 153, 34, 0.3)',
                        color: '#d29922',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      {isLoading ? 'Stopping...' : 'Stop'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleStartMcp(server.name)}
                      disabled={isLoading || server.status === 'error'}
                      style={{
                        backgroundColor:
                          isLoading || server.status === 'error'
                            ? '#21262d'
                            : 'rgba(63, 185, 80, 0.15)',
                        border: `1px solid ${isLoading || server.status === 'error' ? '#30363d' : 'rgba(63, 185, 80, 0.3)'}`,
                        color: isLoading || server.status === 'error' ? '#484f58' : '#3fb950',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        cursor: isLoading || server.status === 'error' ? 'not-allowed' : 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      {isLoading ? 'Starting...' : 'Start'}
                    </button>
                  )}
                  {server.status === 'running' && server.tools.length > 0 && (
                    <button
                      onClick={() => setExpandedMcpServer(isExpanded ? null : server.name)}
                      style={{
                        backgroundColor: '#21262d',
                        border: '1px solid #30363d',
                        color: '#8b949e',
                        padding: '4px 10px',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                      }}
                    >
                      {isExpanded ? 'Hide' : 'Tools'} ({server.tools.length})
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveMcp(server.name)}
                    disabled={isLoading}
                    style={{
                      backgroundColor: 'rgba(248, 81, 73, 0.15)',
                      border: '1px solid rgba(248, 81, 73, 0.3)',
                      color: '#f85149',
                      padding: '4px 10px',
                      borderRadius: '4px',
                      cursor: isLoading ? 'not-allowed' : 'pointer',
                      fontSize: '0.75rem',
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {/* Error message */}
              {server.error && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '0.8rem',
                    color: '#f85149',
                    fontFamily: 'monospace',
                  }}
                >
                  {server.error}
                </div>
              )}

              {/* Expanded tools list */}
              {isExpanded && server.tools.length > 0 && (
                <div
                  style={{
                    marginTop: '12px',
                    paddingTop: '12px',
                    borderTop: '1px solid #30363d',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: '8px', fontWeight: 600 }}>
                    Available Tools
                  </div>
                  {server.tools.map((tool) => (
                    <ToolCard key={tool.name} tool={tool} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </Section>

      {/* General */}
      <Section title="General">
        <div
          style={{
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Theme</div>
              <div style={{ fontSize: '0.8rem', color: '#484f58', marginTop: '2px' }}>
                Choose your preferred appearance
              </div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {(['dark', 'light'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => handleThemeChange(t)}
                  style={{
                    backgroundColor: theme === t ? '#238636' : '#21262d',
                    border: `1px solid ${theme === t ? '#2ea043' : '#30363d'}`,
                    color: '#c9d1d9',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    textTransform: 'capitalize',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          style={{
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '10px',
            padding: '16px 20px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Default Provider</div>
              <div style={{ fontSize: '0.8rem', color: '#484f58', marginTop: '2px' }}>
                Provider used for new sessions
              </div>
            </div>
            <select
              value={defaultProvider}
              onChange={(e) => handleDefaultProviderChange(e.target.value)}
              style={{
                backgroundColor: '#0d1117',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#c9d1d9',
                padding: '6px 10px',
                fontSize: '0.85rem',
                outline: 'none',
              }}
            >
              {PROVIDER_CONFIG.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      {/* About */}
      <Section title="About">
        <div
          style={{
            backgroundColor: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '10px',
            padding: '16px 20px',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <InfoRow label="App" value="Singularity v0.1.0" />
            <InfoRow
              label="Platform"
              value={
                typeof window !== 'undefined'
                  ? (window.platform as string) || 'unknown'
                  : 'unknown'
              }
            />
            <InfoRow label="Engine" value="Electron + React + TypeScript" />
          </div>
        </div>
      </Section>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tool card sub-component
// ---------------------------------------------------------------------------

function ToolCard({ tool }: { tool: McpTool }) {
  const [expanded, setExpanded] = useState(false)

  const schemaPreview = tool.inputSchema.properties
    ? Object.keys(tool.inputSchema.properties).slice(0, 3).join(', ')
    : ''

  return (
    <div
      style={{
        backgroundColor: '#0d1117',
        border: '1px solid #21262d',
        borderRadius: '6px',
        padding: '10px 14px',
        marginBottom: '6px',
        cursor: 'pointer',
      }}
      onClick={() => setExpanded(!expanded)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#58a6ff' }}>
          {tool.name}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#484f58' }}>
          {expanded ? 'collapse' : 'expand'}
        </div>
      </div>
      <div style={{ fontSize: '0.8rem', color: '#8b949e', marginTop: '2px' }}>
        {tool.description}
      </div>
      {expanded && (tool.inputSchema.properties as Record<string, { type?: string; description?: string }> | undefined) && (
        <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#484f58', fontFamily: 'monospace' }}>
          <div style={{ marginBottom: '4px', color: '#8b949e' }}>Parameters:</div>
          {Object.entries(tool.inputSchema.properties as Record<string, { type?: string; description?: string }>).map(
            ([key, val]) => (
              <div key={key} style={{ paddingLeft: '12px', marginBottom: '2px' }}>
                <span style={{ color: '#d2a8ff' }}>{key}</span>
                <span style={{ color: '#484f58' }}>: {val.type || 'any'}</span>
                {val.description ? (
                  <span style={{ color: '#6e7681' }}> // {String(val.description)}</span>
                ) : null}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '32px' }}>
      <h2
        style={{
          fontSize: '1.1rem',
          fontWeight: 600,
          color: '#8b949e',
          marginBottom: '16px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          borderBottom: '1px solid #21262d',
          paddingBottom: '8px',
        }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 0',
      }}
    >
      <span style={{ color: '#484f58', fontSize: '0.85rem' }}>{label}</span>
      <span
        style={{
          color: '#c9d1d9',
          fontSize: '0.85rem',
          fontFamily: 'monospace',
        }}
      >
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// OAuth device flow card
// ---------------------------------------------------------------------------

interface OAuthCardProps {
  providerName: string
  color: string
  status: 'idle' | 'pending' | 'complete' | 'error'
  error: string
  userCode: string
  verifyUri: string
  onConnect: () => void
  providerLabel: string
}

function OAuthCard({ providerName, color, status, error, userCode, verifyUri, onConnect, providerLabel }: OAuthCardProps) {
  return (
    <div
      style={{
        backgroundColor: '#161b22',
        border: '1px solid #30363d',
        borderRadius: '10px',
        padding: '16px 20px',
        marginBottom: '12px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: status === 'complete' ? '#3fb950' : status === 'error' ? '#f85149' : '#484f58',
            boxShadow: status === 'complete' ? '0 0 6px #3fb950' : 'none',
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.95rem', color }}>
            {providerName}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#484f58', marginTop: '2px' }}>
            {status === 'complete'
              ? 'Connected'
              : status === 'pending'
                ? 'Waiting for authorization...'
                : status === 'error'
                  ? error
                  : 'Not connected'}
          </div>
        </div>
        {(status === 'idle' || status === 'error') && (
          <button
            onClick={onConnect}
            style={{
              backgroundColor: '#238636',
              border: '1px solid #2ea043',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              whiteSpace: 'nowrap',
            }}
          >
            Connect
          </button>
        )}
        {status === 'pending' && (
          <span style={{ fontSize: '0.8rem', color: '#d29922' }}>
            Connecting...
          </span>
        )}
        {status === 'complete' && (
          <span style={{ fontSize: '0.8rem', color: '#3fb950' }}>
            \u2705 Connected
          </span>
        )}
      </div>

      {/* Device flow UI: show code when pending */}
      {status === 'pending' && userCode && (
        <div
          style={{
            width: '100%',
            backgroundColor: '#0d1117',
            border: '1px solid #30363d',
            borderRadius: '8px',
            padding: '12px 16px',
            marginTop: '8px',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: '#8b949e', marginBottom: '6px' }}>
            Enter this code on {providerLabel}:
          </div>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              fontFamily: 'monospace',
              color: '#e94560',
              letterSpacing: '0.1em',
              marginBottom: '8px',
            }}
          >
            {userCode}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#484f58' }}>
            Verification URL: <span style={{ color: '#58a6ff', fontFamily: 'monospace' }}>{verifyUri}</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#484f58', marginTop: '4px' }}>
            A browser window should have opened. If not, visit the URL above and enter the code manually.
          </div>
        </div>
      )}
    </div>
  )
}
