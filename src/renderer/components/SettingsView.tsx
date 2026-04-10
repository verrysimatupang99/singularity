import { useState, useEffect, useCallback, useRef } from 'react'
import { AppSettings, ProviderInfo, McpServerInfo, McpServerConfig, McpTool, GithubDeviceAuthResult } from '../types'

interface SettingsViewProps {
  settings: AppSettings | null
  providers: ProviderInfo[]
  onSaveSettings: (settings: Partial<AppSettings>) => void
  onSetApiKey: (provider: string, key: string) => Promise<boolean>
  onDeleteApiKey: (provider: string) => Promise<void>
  onBack: () => void
}

type ConnectionMethod = 'api-key' | 'oauth' | 'cli-detect' | 'import'

const PROVIDER_CONFIG: Array<{
  id: string
  name: string
  color: string
  keyLabel: string
  connectionMethod: ConnectionMethod
  icon: string
}> = [
  { id: 'anthropic', name: 'Anthropic', color: '#d46f2f', keyLabel: 'API Key', connectionMethod: 'api-key', icon: '🤖' },
  { id: 'openai', name: 'OpenAI', color: '#10a37f', keyLabel: 'API Key', connectionMethod: 'api-key', icon: '🔵' },
  { id: 'openrouter', name: 'OpenRouter', color: '#3b82f6', keyLabel: 'API Key', connectionMethod: 'api-key', icon: '🌐' },
  { id: 'copilot', name: 'GitHub Copilot', color: '#24292e', keyLabel: 'OAuth Token', connectionMethod: 'oauth', icon: '🐙' },
  { id: 'gemini', name: 'Google Gemini', color: '#4285f4', keyLabel: 'API Key', connectionMethod: 'import', icon: '💎' },
  { id: 'qwen', name: 'Qwen', color: '#615ef0', keyLabel: 'API Key', connectionMethod: 'api-key', icon: '🔮' },
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

  // Security state (TASK 4c)
  const [isSecureMode, setIsSecureMode] = useState<boolean>(true)

  // Gemini import state (TASK 5c)
  const [geminiCredsImporting, setGeminiCredsImporting] = useState(false)
  const [geminiCredsImportResult, setGeminiCredsImportResult] = useState<'idle' | 'success' | 'error'>('idle')
  const [geminiCredsImportError, setGeminiCredsImportError] = useState('')

  // GitHub device flow state (TASK 4b)
  const [showGithubDeviceFlow, setShowGithubDeviceFlow] = useState(false)
  const [githubDeviceUserCode, setGithubDeviceUserCode] = useState('')
  const [githubDeviceVerifyUri, setGithubDeviceVerifyUri] = useState('')
  const [githubDeviceCode, setGithubDeviceCode] = useState('')
  const [githubDevicePolling, setGithubDevicePolling] = useState(false)
  const githubPollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // MCP state
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([])
  const [showAddMcp, setShowAddMcp] = useState(false)
  const [newMcpName, setNewMcpName] = useState('')
  const [newMcpCommand, setNewMcpCommand] = useState('')
  const [newMcpArgs, setNewMcpArgs] = useState('')
  const [newMcpTimeout, setNewMcpTimeout] = useState('10000')
  const [mcpLoading, setMcpLoading] = useState<Set<string>>(new Set())
  const [expandedMcpServer, setExpandedMcpServer] = useState<string | null>(null)

  // Plugin state
  const [installedPlugins, setInstalledPlugins] = useState<Array<{ name: string; version: string; toolCount: number }>>([])
  const [pluginFeedback, setPluginFeedback] = useState<string | null>(null)

  // Marketplace state
  const [pluginTab, setPluginTab] = useState<'installed' | 'marketplace'>('installed')
  const [registryPlugins, setRegistryPlugins] = useState<Array<{ name: string; displayName: string; version: string; description: string; author: string; downloadUrl: string; sha256: string; tools: string[]; homepage: string }>>([])
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryError, setRegistryError] = useState<string | null>(null)
  const [installingPlugin, setInstallingPlugin] = useState<string | null>(null)
  const [customRegistryUrl, setCustomRegistryUrl] = useState('')

  // OAuth state
  const [githubAuthStatus, setGithubAuthStatus] = useState<'idle' | 'pending' | 'complete' | 'error'>('idle')
  const [githubUserCode, setGithubUserCode] = useState('')
  const [githubVerifyUri, setGithubVerifyUri] = useState('')
  const [githubAuthError, setGithubAuthError] = useState('')
  const [qwenAuthStatus, setQwenAuthStatus] = useState<'idle' | 'pending' | 'complete' | 'error'>('idle')
  const [qwenUserCode, setQwenUserCode] = useState('')
  const [qwenVerifyUri, setQwenVerifyUri] = useState('')
  const [qwenAuthError, setQwenAuthError] = useState('')
  const [qwenValidating, setQwenValidating] = useState(false)
  const [qwenValidationResult, setQwenValidationResult] = useState<{ valid: boolean; models?: string[]; error?: string } | null>(null)
  const [googleAuthStatus, setGoogleAuthStatus] = useState<'idle' | 'pending' | 'complete' | 'error'>('idle')
  const [googleAuthError, setGoogleAuthError] = useState('')
  const [geminiImportStatus, setGeminiImportStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [geminiImportError, setGeminiImportError] = useState('')
  const [geminiValidating, setGeminiValidating] = useState(false)
  const [geminiValidationResult, setGeminiValidationResult] = useState<{ valid: boolean; models?: string[]; error?: string } | null>(null)
  const [showGoogleOAuthGuide, setShowGoogleOAuthGuide] = useState(false)
  const [googleOAuthClientId, setGoogleOAuthClientId] = useState('')
  const [googleOAuthClientStatus, setGoogleOAuthClientStatus] = useState<'idle' | 'pending' | 'complete' | 'error'>('idle')
  const [googleOAuthClientError, setGoogleOAuthClientError] = useState('')

  const theme = settings?.theme || 'dark'
  const defaultProvider = settings?.defaultProvider || 'openai'
  const defaultModel = settings?.defaultModel || 'gpt-4o'

  // Load MCP servers and check secure mode on mount
  useEffect(() => {
    loadMcpServers()
    checkSecureMode()
    loadPlugins()
  }, [])

  const loadPlugins = useCallback(async () => {
    try {
      const list = await window.api.pluginsList()
      setInstalledPlugins(list)
    } catch (err) {
      console.error('Failed to load plugins:', err)
    }
  }, [])

  const handleInstallPlugin = useCallback(async () => {
    const pluginDir = await window.api.fsPickFolder()
    if (!pluginDir) return
    try {
      const result = await window.api.pluginsInstall(pluginDir)
      if (result.success) {
        setPluginFeedback(`Plugin "${result.name}" installed successfully`)
        await loadPlugins()
      } else {
        setPluginFeedback(`Failed to install plugin: ${result.error}`)
      }
    } catch (err) {
      setPluginFeedback(`Failed to install plugin: ${err instanceof Error ? err.message : String(err)}`)
    }
    setTimeout(() => setPluginFeedback(null), 3000)
  }, [loadPlugins])

  const handleUnloadPlugin = useCallback(async (name: string) => {
    try {
      await window.api.pluginsUnload(name)
      setPluginFeedback(`Plugin "${name}" unloaded`)
      await loadPlugins()
    } catch (err) {
      setPluginFeedback(`Failed to unload plugin: ${err instanceof Error ? err.message : String(err)}`)
    }
    setTimeout(() => setPluginFeedback(null), 3000)
  }, [loadPlugins])

  const handleRefreshRegistry = useCallback(async () => {
    setRegistryLoading(true)
    setRegistryError(null)
    try {
      const url = customRegistryUrl || undefined
      const plugins = await window.api.pluginsFetchRegistry(url)
      setRegistryPlugins(plugins)
    } catch (err) {
      setRegistryError(err instanceof Error ? err.message : String(err))
    }
    setRegistryLoading(false)
  }, [customRegistryUrl])

  const handleInstallFromRegistry = useCallback(async (entry: { name: string; displayName: string; version: string; description: string; author: string; downloadUrl: string; sha256: string; tools: string[]; homepage: string }) => {
    setInstallingPlugin(entry.name)
    try {
      const result = await window.api.pluginsInstallFromRegistry(entry)
      if (result.success) {
        setPluginFeedback(`Plugin "${entry.name}" installed successfully`)
        await loadPlugins()
        setPluginTab('installed')
      } else {
        setPluginFeedback(`Failed to install "${entry.name}": ${result.error}`)
      }
    } catch (err) {
      setPluginFeedback(`Failed to install "${entry.name}": ${err instanceof Error ? err.message : String(err)}`)
    }
    setInstallingPlugin(null)
    setTimeout(() => setPluginFeedback(null), 3000)
  }, [loadPlugins])

  const checkSecureMode = useCallback(async () => {
    try {
      const secure = await window.api.isSecureMode()
      setIsSecureMode(secure)
    } catch {
      setIsSecureMode(false)
    }
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
    const MAX_POLL_ATTEMPTS = 120  // ~10 minutes at 5s intervals
    let attempts = 0
    const poll = async () => {
      attempts++
      if (attempts > MAX_POLL_ATTEMPTS) {
        setGithubAuthStatus('error')
        setGithubAuthError('Authentication timed out. Please try again.')
        return
      }
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

  const handleQwenValidate = useCallback(async () => {
    const key = apiKeyInputs['qwen']
    if (!key || key.length < 4) {
      setQwenValidationResult({ valid: false, error: 'Enter an API key first' })
      return
    }
    setQwenValidating(true)
    setQwenValidationResult(null)
    try {
      const result = await window.api.authValidateQwen(key)
      setQwenValidationResult(result)
    } catch (err) {
      setQwenValidationResult({ valid: false, error: err instanceof Error ? err.message : String(err) })
    }
    setQwenValidating(false)
  }, [apiKeyInputs])

  const handleQwenOpenConsole = useCallback(async () => {
    try {
      await window.api.authOpenQwenConsole()
    } catch (err) {
      console.error('Failed to open Qwen console:', err)
    }
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

  const handleGeminiValidate = useCallback(async () => {
    const key = apiKeyInputs['gemini']
    if (!key || key.length < 4) {
      setGeminiValidationResult({ valid: false, error: 'Enter an API key first' })
      return
    }
    setGeminiValidating(true)
    setGeminiValidationResult(null)
    try {
      const result = await window.api.authValidateGemini(key)
      setGeminiValidationResult(result)
    } catch (err) {
      setGeminiValidationResult({ valid: false, error: err instanceof Error ? err.message : String(err) })
    }
    setGeminiValidating(false)
  }, [apiKeyInputs])

  const handleGoogleOAuthGuideOpen = useCallback(() => {
    setShowGoogleOAuthGuide(true)
  }, [])

  const handleGoogleOAuthGuideClose = useCallback(() => {
    setShowGoogleOAuthGuide(false)
  }, [])

  const handleGoogleOAuthConsoleOpen = useCallback(async () => {
    try {
      await window.api.authOpenGoogleConsole()
    } catch (err) {
      console.error('Failed to open Google Cloud Console:', err)
    }
  }, [])

  const handleGoogleOAuthClientStart = useCallback(async () => {
    if (!googleOAuthClientId || googleOAuthClientId.includes('your-google-client-id')) {
      setGoogleOAuthClientStatus('error')
      setGoogleOAuthClientError('Please enter a valid Google Cloud OAuth Client ID.')
      return
    }
    setGoogleOAuthClientStatus('pending')
    setGoogleOAuthClientError('')
    try {
      const result = await window.api.authGoogleOAuthStart(googleOAuthClientId)
      if (result.status === 'pending') {
        window.open(result.authUrl, '_blank')
        // Wait for callback to resolve
        setGoogleOAuthClientStatus('complete')
        setFeedback('Google OAuth authenticated successfully!')
        setTimeout(() => setFeedback(null), 3000)
      } else if (result.status === 'error') {
        setGoogleOAuthClientStatus('error')
        setGoogleOAuthClientError(result.error || 'Unknown error')
      }
    } catch (err) {
      setGoogleOAuthClientStatus('error')
      setGoogleOAuthClientError(err instanceof Error ? err.message : String(err))
    }
  }, [googleOAuthClientId])

  const handleGoogleOAuthClientStop = useCallback(async () => {
    try {
      await window.api.authGoogleOAuthStop(googleOAuthClientId)
    } catch {}
    setGoogleOAuthClientStatus('idle')
  }, [googleOAuthClientId])

  // -----------------------------------------------------------------------
  // GitHub device flow handlers (TASK 4b)
  // -----------------------------------------------------------------------

  const stopGithubPolling = useCallback(() => {
    if (githubPollRef.current) {
      clearTimeout(githubPollRef.current)
      githubPollRef.current = null
    }
    setGithubDevicePolling(false)
  }, [])

  const handleGithubConnect = useCallback(async () => {
    setShowGithubDeviceFlow(true)
    setGithubDeviceUserCode('')
    setGithubDeviceVerifyUri('')
    setGithubDeviceCode('')
    setGithubDevicePolling(false)
    try {
      const result = await window.api.authConnect('github-copilot')
      if (result.error) {
        setFeedback(`GitHub auth failed: ${result.error}`)
        setShowGithubDeviceFlow(false)
        setTimeout(() => setFeedback(null), 3000)
        return
      }
      setGithubDeviceUserCode(result.user_code)
      setGithubDeviceVerifyUri(result.verification_uri)
      setGithubDeviceCode(result.user_code) // Use user_code as device_code reference
      // Start polling
      startGithubDevicePolling(result.user_code, 5)
    } catch (err) {
      setFeedback(`GitHub auth failed: ${err instanceof Error ? err.message : String(err)}`)
      setShowGithubDeviceFlow(false)
      setTimeout(() => setFeedback(null), 3000)
    }
  }, [])

  const startGithubDevicePolling = useCallback((deviceCode: string, intervalSec: number) => {
    setGithubDevicePolling(true)
    const poll = async () => {
      try {
        const result = await window.api.authConnectPoll('github-copilot', deviceCode, intervalSec)
        if (result.access_token) {
          setGithubDevicePolling(false)
          setShowGithubDeviceFlow(false)
          setFeedback('GitHub Copilot authenticated successfully!')
          setTimeout(() => setFeedback(null), 3000)
          return
        }
        if (result.error && !result.pending) {
          setGithubDevicePolling(false)
          setFeedback(`GitHub auth failed: ${result.error}`)
          setShowGithubDeviceFlow(false)
          setTimeout(() => setFeedback(null), 3000)
          return
        }
        // Still pending — poll again
        githubPollRef.current = setTimeout(poll, intervalSec * 1000)
      } catch (err) {
        setGithubDevicePolling(false)
        setFeedback(`GitHub poll failed: ${err instanceof Error ? err.message : String(err)}`)
        setShowGithubDeviceFlow(false)
        setTimeout(() => setFeedback(null), 3000)
      }
    }
    githubPollRef.current = setTimeout(poll, intervalSec * 1000)
  }, [])

  const handleGithubDeviceFlowCancel = useCallback(() => {
    stopGithubPolling()
    setShowGithubDeviceFlow(false)
  }, [stopGithubPolling])

  // -----------------------------------------------------------------------
  // Gemini credential import handler (TASK 5c)
  // -----------------------------------------------------------------------

  const handleGeminiCredsImport = useCallback(async () => {
    setGeminiCredsImporting(true)
    setGeminiCredsImportResult('idle')
    setGeminiCredsImportError('')
    try {
      const result = await window.api.authImportGeminiCreds()
      if (result.success) {
        setGeminiCredsImportResult('success')
        setFeedback('Gemini CLI credentials imported successfully!')
      } else {
        setGeminiCredsImportResult('error')
        setGeminiCredsImportError(result.error || 'Unknown error')
      }
    } catch (err) {
      setGeminiCredsImportResult('error')
      setGeminiCredsImportError(err instanceof Error ? err.message : String(err))
    }
    setGeminiCredsImporting(false)
    setTimeout(() => setFeedback(null), 3000)
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

      {/* Keychain Warning Banner (TASK 4c) */}
      {!isSecureMode && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '20px',
            borderRadius: '8px',
            backgroundColor: 'rgba(210, 153, 34, 0.15)',
            border: '1px solid rgba(210, 153, 34, 0.3)',
            color: '#d29922',
            fontSize: '0.85rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '1rem' }}>\u26a0\ufe0f</span>
          <div>
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>
              Credentials use fallback encryption (system keychain unavailable).
            </div>
            <div style={{ opacity: 0.8 }}>
              Install GNOME Keyring or KWallet for stronger security.
            </div>
          </div>
        </div>
      )}

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

      {/* Provider Connections (TASK 4a) */}
      <Section title="Provider Connections">
        {PROVIDER_CONFIG.map((config) => {
          const status = providerStatus[config.id] || 'disconnected'
          const hasKey = status === 'connected'

          return (
            <ProviderCard
              key={config.id}
              config={config}
              hasKey={hasKey}
              status={status}
              apiKeyInput={apiKeyInputs[config.id] || ''}
              savingKey={savingKey === config.id}
              geminiCredsImporting={config.id === 'gemini' ? geminiCredsImporting : false}
              geminiCredsImportResult={config.id === 'gemini' ? geminiCredsImportResult : 'idle'}
              geminiCredsImportError={config.id === 'gemini' ? geminiCredsImportError : ''}
              onInputChange={(value) =>
                setApiKeyInputs((prev) => ({ ...prev, [config.id]: value }))
              }
              onSaveKey={() => handleSaveKey(config.id)}
              onDeleteKey={() => handleDeleteKey(config.id)}
              onGithubConnect={handleGithubConnect}
              onGeminiImport={handleGeminiCredsImport}
              onGeminiValidate={config.id === 'gemini' ? handleGeminiValidate : undefined}
              onGeminiOAuthGuide={config.id === 'gemini' ? handleGoogleOAuthGuideOpen : undefined}
              geminiValidating={config.id === 'gemini' ? geminiValidating : false}
              geminiValidationResult={config.id === 'gemini' ? geminiValidationResult : null}
              onQwenValidate={config.id === 'qwen' ? handleQwenValidate : undefined}
              onQwenOpenConsole={config.id === 'qwen' ? handleQwenOpenConsole : undefined}
              qwenValidating={config.id === 'qwen' ? qwenValidating : false}
              qwenValidationResult={config.id === 'qwen' ? qwenValidationResult : null}
            />
          )
        })}
      </Section>

      {/* GitHub Device Flow Modal (TASK 4b) */}
      {showGithubDeviceFlow && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={handleGithubDeviceFlowCancel}
        >
          <div
            style={{
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '12px',
              padding: '24px',
              minWidth: 400,
              maxWidth: 480,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 20px', fontSize: 18, color: '#f0f6fc' }}>
              Connect GitHub Copilot
            </h2>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: 4 }}>
                Go to:
              </div>
              <div
                style={{
                  fontSize: '0.95rem',
                  color: '#58a6ff',
                  fontFamily: 'monospace',
                  backgroundColor: '#0d1117',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #30363d',
                }}
              >
                github.com/login/device
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: 4 }}>
                Enter code:
              </div>
              <div
                style={{
                  fontSize: '1.75rem',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  color: '#e94560',
                  letterSpacing: '0.15em',
                  backgroundColor: '#0d1117',
                  padding: '12px 16px',
                  borderRadius: 6,
                  border: '1px solid #30363d',
                  textAlign: 'center',
                }}
              >
                {githubDeviceUserCode}
              </div>
            </div>

            <div style={{ fontSize: '0.8rem', color: '#484f58', marginBottom: 16, textAlign: 'center' }}>
              A browser window should have opened automatically.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
              {githubDevicePolling && (
                <span style={{ fontSize: '0.85rem', color: '#d29922' }}>
                  Waiting for authorization... \u27f3
                </span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                onClick={handleGithubDeviceFlowCancel}
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
            </div>
          </div>
        </div>
      )}

      {/* Google OAuth Guide Modal */}
      {showGoogleOAuthGuide && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={handleGoogleOAuthGuideClose}
        >
          <div
            style={{
              backgroundColor: '#161b22',
              border: '1px solid #30363d',
              borderRadius: '12px',
              padding: '24px',
              minWidth: 440,
              maxWidth: 520,
              maxHeight: '80vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 16px', fontSize: 18, color: '#f0f6fc' }}>
              Setup Google OAuth
            </h2>

            <div style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: 16 }}>
              Follow these steps to get your Google Cloud OAuth Client ID:
            </div>

            <ol style={{ fontSize: '0.85rem', color: '#c9d1d9', paddingLeft: 20, marginBottom: 20, lineHeight: 1.6 }}>
              <li>Go to the <button onClick={handleGoogleOAuthConsoleOpen} style={{ background: 'none', border: 'none', color: '#58a6ff', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>Google Cloud Console</button> and create a new project (or select existing).</li>
              <li>Enable the &quot;Google Cloud Resource Manager API&quot; in API &amp; Services &gt; Library.</li>
              <li>Go to APIs &amp; Services &gt; OAuth consent screen and configure it (External or Internal).</li>
              <li>Go to Credentials &gt; Create Credentials &gt; OAuth client ID. Choose &quot;Web application&quot;, add <code style={{ backgroundColor: '#0d1117', padding: '2px 6px', borderRadius: 4 }}>http://127.0.0.1:9876/callback</code> as an Authorized redirect URI.</li>
            </ol>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: '0.85rem', color: '#8b949e', display: 'block', marginBottom: 6 }}>
                OAuth Client ID
              </label>
              <input
                type="text"
                placeholder="xxxxx.apps.googleusercontent.com"
                value={googleOAuthClientId}
                onChange={(e) => setGoogleOAuthClientId(e.target.value)}
                style={{
                  backgroundColor: '#0d1117',
                  border: '1px solid #30363d',
                  borderRadius: 6,
                  color: '#c9d1d9',
                  padding: '8px 12px',
                  fontSize: '0.85rem',
                  width: '100%',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {googleOAuthClientError && (
              <div style={{ fontSize: '0.8rem', color: '#f85149', marginBottom: 12 }}>
                {googleOAuthClientError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              {googleOAuthClientStatus === 'pending' && (
                <span style={{ fontSize: '0.85rem', color: '#d29922', marginRight: 'auto', alignSelf: 'center' }}>
                  Authorizing...
                </span>
              )}
              {googleOAuthClientStatus === 'complete' && (
                <span style={{ fontSize: '0.85rem', color: '#3fb950', marginRight: 'auto', alignSelf: 'center' }}>
                  Authenticated!
                </span>
              )}
              {googleOAuthClientStatus === 'idle' || googleOAuthClientStatus === 'error' ? (
                <button
                  onClick={handleGoogleOAuthClientStart}
                  style={{
                    backgroundColor: '#238636',
                    border: '1px solid #2ea043',
                    color: '#fff',
                    padding: '8px 20px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  Start OAuth
                </button>
              ) : googleOAuthClientStatus === 'pending' ? (
                <button
                  onClick={handleGoogleOAuthClientStop}
                  style={{
                    backgroundColor: 'transparent',
                    color: '#8b949e',
                    border: '1px solid #30363d',
                    padding: '8px 20px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  Cancel
                </button>
              ) : null}
              <button
                onClick={handleGoogleOAuthGuideClose}
                style={{
                  backgroundColor: 'transparent',
                  color: '#8b949e',
                  border: '1px solid #30363d',
                  padding: '8px 20px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 14,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Plugins */}
      <Section title="Plugins">
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            onClick={() => setPluginTab('installed')}
            style={{
              backgroundColor: pluginTab === 'installed' ? '#238636' : '#21262d',
              border: `1px solid ${pluginTab === 'installed' ? '#2ea043' : '#30363d'}`,
              color: pluginTab === 'installed' ? '#fff' : '#8b949e',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Installed
          </button>
          <button
            onClick={() => setPluginTab('marketplace')}
            style={{
              backgroundColor: pluginTab === 'marketplace' ? '#238636' : '#21262d',
              border: `1px solid ${pluginTab === 'marketplace' ? '#2ea043' : '#30363d'}`,
              color: pluginTab === 'marketplace' ? '#fff' : '#8b949e',
              padding: '6px 14px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.8rem',
            }}
          >
            Marketplace
          </button>
        </div>

        {pluginFeedback && (
          <div
            style={{
              padding: '10px 16px',
              marginBottom: '16px',
              borderRadius: '8px',
              backgroundColor: pluginFeedback.includes('Failed') || pluginFeedback.includes('error') || pluginFeedback.includes('Error')
                ? 'rgba(248, 81, 73, 0.15)'
                : 'rgba(63, 185, 80, 0.15)',
              border: `1px solid ${pluginFeedback.includes('Failed') || pluginFeedback.includes('error') || pluginFeedback.includes('Error') ? 'rgba(248, 81, 73, 0.3)' : 'rgba(63, 185, 80, 0.3)'}`,
              color: pluginFeedback.includes('Failed') || pluginFeedback.includes('error') || pluginFeedback.includes('Error') ? '#f85149' : '#3fb950',
              fontSize: '0.85rem',
            }}
          >
            {pluginFeedback}
          </div>
        )}

        {/* Installed tab */}
        {pluginTab === 'installed' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: '#8b949e' }}>
                Manage community plugins that extend agent capabilities with custom tools.
              </div>
              <button
                onClick={handleInstallPlugin}
                style={{
                  backgroundColor: '#238636',
                  border: '1px solid #2ea043',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                }}
              >
                + Install Plugin
              </button>
            </div>

            {installedPlugins.length === 0 && (
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
                No plugins installed. Click &quot;+ Install Plugin&quot; to select a plugin directory.
              </div>
            )}

            {installedPlugins.map((plugin) => (
              <div
                key={plugin.name}
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
                    backgroundColor: '#3fb950',
                    boxShadow: '0 0 6px #3fb950',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#58a6ff' }}>{plugin.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#484f58', marginTop: '2px' }}>
                    v{plugin.version} &middot; {plugin.toolCount} tool{plugin.toolCount !== 1 ? 's' : ''}
                  </div>
                </div>
                <button
                  onClick={() => handleUnloadPlugin(plugin.name)}
                  style={{
                    backgroundColor: 'rgba(248, 81, 73, 0.15)',
                    border: '1px solid rgba(248, 81, 73, 0.3)',
                    color: '#f85149',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                  }}
                >
                  Unload
                </button>
              </div>
            ))}
          </>
        )}

        {/* Marketplace tab */}
        {pluginTab === 'marketplace' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ fontSize: '0.85rem', color: '#8b949e' }}>
                Browse and install community plugins from the registry.
              </div>
              <button
                onClick={handleRefreshRegistry}
                disabled={registryLoading}
                style={{
                  backgroundColor: registryLoading ? '#21262d' : '#238636',
                  border: '1px solid #2ea043',
                  color: registryLoading ? '#484f58' : '#fff',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  cursor: registryLoading ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {registryLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>

            {registryError && (
              <div
                style={{
                  padding: '10px 16px',
                  marginBottom: '16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(248, 81, 73, 0.15)',
                  border: '1px solid rgba(248, 81, 73, 0.3)',
                  color: '#f85149',
                  fontSize: '0.85rem',
                }}
              >
                {registryError}
              </div>
            )}

            {registryPlugins.length === 0 && !registryLoading && !registryError && (
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
                No plugins found. Click &quot;Refresh&quot; to load the registry.
              </div>
            )}

            {registryPlugins.map((plugin) => (
              <div
                key={plugin.name}
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
                    backgroundColor: '#58a6ff',
                    boxShadow: '0 0 6px #58a6ff',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#58a6ff' }}>{plugin.displayName || plugin.name}</div>
                  <div style={{ fontSize: '0.8rem', color: '#8b949e', marginTop: '2px' }}>
                    v{plugin.version} &middot; by {plugin.author}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#484f58', marginTop: '4px' }}>
                    {plugin.description}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#484f58', marginTop: '4px' }}>
                    {plugin.tools.length} tool{plugin.tools.length !== 1 ? 's' : ''}: {plugin.tools.join(', ')}
                  </div>
                </div>
                <button
                  onClick={() => handleInstallFromRegistry(plugin)}
                  disabled={installingPlugin === plugin.name}
                  style={{
                    backgroundColor: installingPlugin === plugin.name ? '#21262d' : '#238636',
                    border: '1px solid #2ea043',
                    color: installingPlugin === plugin.name ? '#484f58' : '#fff',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    cursor: installingPlugin === plugin.name ? 'not-allowed' : 'pointer',
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {installingPlugin === plugin.name ? 'Installing...' : 'Install'}
                </button>
              </div>
            ))}

            {registryLoading && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px',
                  color: '#484f58',
                  fontSize: '0.85rem',
                }}
              >
                Loading registry...
              </div>
            )}

            {/* Custom registry URL */}
            <div
              style={{
                backgroundColor: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '10px',
                padding: '16px 20px',
                marginTop: '16px',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#8b949e', marginBottom: '8px' }}>
                Add Registry URL
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="https://example.com/registry.json"
                  value={customRegistryUrl}
                  onChange={(e) => setCustomRegistryUrl(e.target.value)}
                  style={{
                    flex: 1,
                    backgroundColor: '#0d1117',
                    border: '1px solid #30363d',
                    borderRadius: '6px',
                    color: '#c9d1d9',
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleRefreshRegistry}
                  disabled={registryLoading || !customRegistryUrl}
                  style={{
                    backgroundColor: customRegistryUrl && !registryLoading ? '#238636' : '#21262d',
                    border: '1px solid #2ea043',
                    color: customRegistryUrl && !registryLoading ? '#fff' : '#484f58',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    cursor: customRegistryUrl && !registryLoading ? 'pointer' : 'not-allowed',
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Load
                </button>
              </div>
            </div>
          </>
        )}
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

// ---------------------------------------------------------------------------
// Provider Card sub-component (TASK 4a)
// ---------------------------------------------------------------------------

interface ProviderCardProps {
  config: { id: string; name: string; color: string; keyLabel: string; connectionMethod: ConnectionMethod; icon: string }
  hasKey: boolean
  status: string
  apiKeyInput: string
  savingKey: boolean
  geminiCredsImporting: boolean
  geminiCredsImportResult: 'idle' | 'success' | 'error'
  geminiCredsImportError: string
  onInputChange: (value: string) => void
  onSaveKey: () => void
  onDeleteKey: () => void
  onGithubConnect: () => void
  onGeminiImport: () => void
  onGeminiValidate?: () => void
  onGeminiOAuthGuide?: () => void
  geminiValidating?: boolean
  geminiValidationResult?: { valid: boolean; models?: string[]; error?: string } | null
  onQwenValidate?: () => void
  onQwenOpenConsole?: () => void
  qwenValidating?: boolean
  qwenValidationResult?: { valid: boolean; models?: string[]; error?: string } | null
}

function ProviderCard({
  config,
  hasKey,
  status,
  apiKeyInput,
  savingKey,
  geminiCredsImporting,
  geminiCredsImportResult,
  geminiCredsImportError,
  onInputChange,
  onSaveKey,
  onDeleteKey,
  onGithubConnect,
  onGeminiImport,
  onGeminiValidate,
  onGeminiOAuthGuide,
  geminiValidating,
  geminiValidationResult,
  onQwenValidate,
  onQwenOpenConsole,
  qwenValidating,
  qwenValidationResult,
}: ProviderCardProps) {
  const isConnected = hasKey || status === 'connected'

  return (
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
      {/* Status indicator */}
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: isConnected ? '#3fb950' : '#484f58',
          boxShadow: isConnected ? '0 0 6px #3fb950' : 'none',
          flexShrink: 0,
        }}
      />

      {/* Provider info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: config.color }}>
          {config.name}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#484f58', marginTop: '2px' }}>
          {isConnected ? 'Connected' : 'Not configured'}
        </div>
      </div>

      {/* Connection method UI */}
      {isConnected ? (
        <button
          onClick={onDeleteKey}
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
          Remove
        </button>
      ) : (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {config.connectionMethod === 'api-key' && (
            <>
              <input
                type="password"
                placeholder={`Enter ${config.keyLabel}`}
                value={apiKeyInput}
                onChange={(e) => onInputChange(e.target.value)}
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
                onClick={onSaveKey}
                disabled={!apiKeyInput || savingKey}
                style={{
                  backgroundColor: apiKeyInput && !savingKey ? '#238636' : '#21262d',
                  border: '1px solid #30363d',
                  color: apiKeyInput && !savingKey ? '#fff' : '#484f58',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  cursor: apiKeyInput && !savingKey ? 'pointer' : 'not-allowed',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {savingKey ? 'Saving...' : 'Save'}
              </button>
              {config.id === 'qwen' && onQwenValidate && (
                <>
                  <button
                    onClick={onQwenValidate}
                    disabled={qwenValidating || !apiKeyInput}
                    style={{
                      backgroundColor: qwenValidating ? '#21262d' : 'rgba(97, 94, 240, 0.15)',
                      border: '1px solid rgba(97, 94, 240, 0.3)',
                      color: qwenValidating ? '#484f58' : '#615ef0',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      cursor: qwenValidating || !apiKeyInput ? 'not-allowed' : 'pointer',
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {qwenValidating ? 'Validating...' : 'Validate'}
                  </button>
                  {onQwenOpenConsole && (
                    <button
                      onClick={onQwenOpenConsole}
                      style={{
                        backgroundColor: '#21262d',
                        border: '1px solid #30363d',
                        color: '#8b949e',
                        padding: '6px 14px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        whiteSpace: 'nowrap',
                      }}
                      title="Open DashScope Console"
                    >
                      Open Console
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {config.id === 'qwen' && qwenValidationResult && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
              {qwenValidationResult.valid
                ? (
                  <span style={{ fontSize: '0.8rem', color: '#3fb950' }}>
                    Valid! ({qwenValidationResult.models?.length || 0} models available)
                  </span>
                )
                : (
                  <span style={{ fontSize: '0.8rem', color: '#f85149' }}>
                    {qwenValidationResult.error}
                  </span>
                )}
            </div>
          )}

          {config.id === 'gemini' && geminiValidationResult && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
              {geminiValidationResult.valid
                ? (
                  <span style={{ fontSize: '0.8rem', color: '#3fb950' }}>
                    Valid! ({geminiValidationResult.models?.length || 0} models available)
                  </span>
                )
                : (
                  <span style={{ fontSize: '0.8rem', color: '#f85149' }}>
                    {geminiValidationResult.error}
                  </span>
                )}
            </div>
          )}

          {config.connectionMethod === 'oauth' && config.id === 'copilot' && (
            <button
              onClick={onGithubConnect}
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
              Connect GitHub
            </button>
          )}

          {config.connectionMethod === 'import' && config.id === 'gemini' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                onClick={onGeminiValidate}
                disabled={geminiValidating || !apiKeyInput}
                style={{
                  backgroundColor: geminiValidating ? '#21262d' : 'rgba(66, 133, 244, 0.15)',
                  border: '1px solid rgba(66, 133, 244, 0.3)',
                  color: geminiValidating ? '#484f58' : '#4285f4',
                  padding: '6px 14px',
                  borderRadius: '6px',
                  cursor: geminiValidating || !apiKeyInput ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {geminiValidating ? 'Validating...' : 'Validate'}
              </button>
              <button
                onClick={onGeminiImport}
                disabled={geminiCredsImporting}
                style={{
                  backgroundColor: geminiCredsImporting ? '#21262d' : '#238636',
                  border: '1px solid #2ea043',
                  color: geminiCredsImporting ? '#484f58' : '#fff',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: geminiCredsImporting ? 'not-allowed' : 'pointer',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap',
                }}
              >
                {geminiCredsImporting ? 'Importing...' : 'Import from ~/.gemini/'}
              </button>
              {onGeminiOAuthGuide && (
                <button
                  onClick={onGeminiOAuthGuide}
                  style={{
                    backgroundColor: '#21262d',
                    border: '1px solid #30363d',
                    color: '#8b949e',
                    padding: '6px 14px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Setup Google OAuth
                </button>
              )}
              {geminiCredsImportResult === 'success' && (
                <span style={{ fontSize: '0.8rem', color: '#3fb950' }}>\u2705 Imported!</span>
              )}
              {geminiCredsImportResult === 'error' && (
                <span style={{ fontSize: '0.75rem', color: '#f85149' }}>{geminiCredsImportError}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
