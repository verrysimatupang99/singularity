import { safeStorage, app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import crypto from 'crypto'
import os from 'os'

// Resolve config directory: use app.getPath('userData') for cross-platform compatibility
// This resolves to:
//   Linux:   ~/.config/singularity
//   macOS:   ~/Library/Application Support/Singularity
//   Windows: %APPDATA%/Singularity
function getConfigDir(): string {
  try {
    return app.getPath('userData')
  } catch {
    // Fallback for early calls before app is ready
    const { homedir } = require('os')
    if (process.platform === 'darwin') {
      return join(homedir(), 'Library', 'Application Support', 'Singularity')
    }
    if (process.platform === 'win32') {
      return join(homedir(), 'AppData', 'Roaming', 'Singularity')
    }
    return join(homedir(), '.config', 'singularity')
  }
}

function getSessionsDir(): string {
  return join(getConfigDir(), 'sessions')
}

// Ensure directories exist
function ensureDirs(): void {
  mkdirSync(getConfigDir(), { recursive: true })
  mkdirSync(getSessionsDir(), { recursive: true })
}

export interface Session {
  id: string
  name: string
  provider: string
  model: string
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface AppSettings {
  theme: 'dark' | 'light'
  defaultProvider: string
  defaultModel: string
  apiKeys: Record<string, string> // provider -> encrypted key (stored)
  layout?: unknown // opaque, stored as-is
}

function getDefaultSettings(): AppSettings {
  return {
    theme: 'dark',
    defaultProvider: 'openai',
    defaultModel: 'gpt-4o',
    apiKeys: {},
  }
}

// ---------------------------------------------------------------------------
// AES-256-GCM fallback when safeStorage is unavailable (headless Linux, etc.)
// ---------------------------------------------------------------------------

let _machineKey: Buffer | null = null

function getMachineKey(): Buffer {
  if (_machineKey) return _machineKey

  // Try to read /etc/machine-id (Linux), fallback to hostname + username
  let machineId = ''
  try {
    if (process.platform === 'linux') {
      machineId = readFileSync('/etc/machine-id', 'utf8').trim()
    }
  } catch {
    // Fallback
  }

  const input = os.hostname() + os.userInfo().username + machineId
  _machineKey = crypto.createHash('sha256').update(input).digest()
  return _machineKey
}

function aesEncrypt(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, encrypted]).toString('hex')
}

function aesDecrypt(hex: string, key: Buffer): string {
  const data = Buffer.from(hex, 'hex')
  const iv = data.slice(0, 16)
  const authTag = data.slice(16, 32)
  const encrypted = data.slice(32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)
  return decipher.update(encrypted) + decipher.final('utf8')
}

// Track whether we're using safeStorage or AES fallback
let _useSafeStorage: boolean | null = null

function isUsingSafeStorage(): boolean {
  if (_useSafeStorage === null) {
    _useSafeStorage = safeStorage.isEncryptionAvailable()
  }
  return _useSafeStorage
}

// Exposed for tests and UI
export function isSecureMode(): boolean {
  return isUsingSafeStorage()
}

function encryptValue(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    _useSafeStorage = true
    const encrypted = safeStorage.encryptString(value)
    return 'sf:' + encrypted.toString('hex')
  }
  // AES-256-GCM fallback
  _useSafeStorage = false
  console.warn('safeStorage encryption not available, using AES-256-GCM fallback')
  const key = getMachineKey()
  return 'aes:' + aesEncrypt(value, key)
}

function decryptValue(encrypted: string): string {
  try {
    if (encrypted.startsWith('sf:')) {
      _useSafeStorage = true
      const buf = Buffer.from(encrypted.slice(3), 'hex')
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(buf)
      }
      throw new Error('safeStorage not available but data was encrypted with it')
    }

    if (encrypted.startsWith('aes:')) {
      _useSafeStorage = false
      const key = getMachineKey()
      return aesDecrypt(encrypted.slice(4), key)
    }

    // Legacy base64 format (from old versions)
    console.warn('Decrypting legacy base64 credential')
    _useSafeStorage = false
    return Buffer.from(encrypted, 'base64').toString('utf8')
  } catch {
    throw new Error('Failed to decrypt stored credential')
  }
}

// --- Session operations ---

export function listSessions(): Session[] {
  ensureDirs()
  const files = readdirSync(getSessionsDir()).filter((f) => f.endsWith('.json'))
  const sessions: Session[] = []
  for (const file of files) {
    try {
      const data = readFileSync(join(getSessionsDir(), file), 'utf8')
      const session = JSON.parse(data) as Session
      sessions.push(session)
    } catch {
      // Skip corrupted files
    }
  }
  // Sort by updatedAt descending
  sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  return sessions
}

export function createSession(data: {
  name?: string
  provider: string
  model: string
}): Session {
  ensureDirs()
  const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const now = Date.now()
  const session: Session = {
    id,
    name: data.name || `Session ${new Date().toLocaleDateString()}`,
    provider: data.provider,
    model: data.model,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
  }
  writeFileSync(join(getSessionsDir(), `${id}.json`), JSON.stringify({ session, messages: [] }, null, 2))
  return session
}

export function deleteSession(id: string): void {
  ensureDirs()
  const filePath = join(getSessionsDir(), `${id}.json`)
  if (existsSync(filePath)) {
    unlinkSync(filePath)
  }
}

export function loadSession(
  id: string,
): { session: Session; messages: ChatMessage[] } {
  ensureDirs()
  const filePath = join(getSessionsDir(), `${id}.json`)
  if (!existsSync(filePath)) {
    throw new Error(`Session not found: ${id}`)
  }
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as {
    session: Session
    messages: ChatMessage[]
  }
  return data
}

export function saveSession(id: string, messages: ChatMessage[]): void {
  ensureDirs()
  const filePath = join(getSessionsDir(), `${id}.json`)
  if (!existsSync(filePath)) {
    throw new Error(`Session not found: ${id}`)
  }
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as {
    session: Session
    messages: ChatMessage[]
  }
  data.session.updatedAt = Date.now()
  data.session.messageCount = messages.length
  data.messages = messages
  writeFileSync(filePath, JSON.stringify(data, null, 2))
}

// --- Settings operations ---

export function getSettings(): AppSettings {
  ensureDirs()
  const filePath = join(getConfigDir(), 'settings.json')
  if (!existsSync(filePath)) {
    return getDefaultSettings()
  }
  try {
    const data = JSON.parse(readFileSync(filePath, 'utf8')) as AppSettings
    return { ...getDefaultSettings(), ...data }
  } catch {
    return getDefaultSettings()
  }
}

export function setSettings(updates: Partial<AppSettings>): AppSettings {
  ensureDirs()
  const current = getSettings()
  const merged = { ...current, ...updates }
  const filePath = join(getConfigDir(), 'settings.json')
  writeFileSync(filePath, JSON.stringify(merged, null, 2))
  return merged
}

// --- Auth / credential operations ---

export function getAuthStatus(): Record<string, { status: string; models: string[] }> {
  const settings = getSettings()
  const providerModels: Record<string, string[]> = {
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    anthropic: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet-20241022'],
    gemini: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro'],
    qwen: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    openrouter: ['openai/gpt-4o', 'anthropic/claude-sonnet-4', 'google/gemini-2.0-flash'],
    copilot: ['gpt-4o-copilot', 'claude-sonnet-copilot'],
  }

  const result: Record<string, { status: string; models: string[] }> = {}
  for (const [provider, models] of Object.entries(providerModels)) {
    const hasKey = provider in settings.apiKeys && settings.apiKeys[provider].length > 0
    result[provider] = {
      status: hasKey ? 'connected' : 'disconnected',
      models,
    }
  }
  return result
}

export function setApiKey(provider: string, key: string): boolean {
  try {
    const encrypted = encryptValue(key)
    setSettings({
      apiKeys: { ...getSettings().apiKeys, [provider]: encrypted },
    })
    return true
  } catch (err) {
    console.error('Failed to store API key:', err)
    return false
  }
}

export function deleteApiKey(provider: string): void {
  const settings = getSettings()
  const { [provider]: _, ...rest } = settings.apiKeys
  setSettings({ apiKeys: rest })
}

export function getApiKey(provider: string): string | null {
  const settings = getSettings()
  const encrypted = settings.apiKeys[provider]
  if (!encrypted) return null
  try {
    return decryptValue(encrypted)
  } catch {
    return null
  }
}

// --- Onboarding ---

export function isFirstRun(): boolean {
  const settings = getSettings()
  return !(settings as any).onboardingComplete
}

export function markOnboardingComplete(): void {
  setSettings({ onboardingComplete: true } as any)
}
