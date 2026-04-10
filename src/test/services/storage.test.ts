import { vi } from 'vitest'

// Mock electron safeStorage
const mockSafeStorage = {
  isEncryptionAvailable: vi.fn(() => true),
  encryptString: vi.fn((val: string) => Buffer.from('enc:' + val)),
  decryptString: vi.fn((buf: Buffer) => {
    const str = buf.toString()
    if (str.startsWith('enc:')) return str.slice(4)
    return 'decrypted'
  }),
}

vi.mock('electron', () => ({
  safeStorage: mockSafeStorage,
  app: {
    getPath: vi.fn(() => '/tmp/singularity-test'),
  },
}))

// Mock fs
const mockFiles = new Map<string, string>()
vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => mockFiles.has(path)),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((path: string) => {
    const content = mockFiles.get(path)
    if (!content) throw new Error(`ENOENT: ${path}`)
    return content
  }),
  writeFileSync: vi.fn((path: string, content: string) => {
    mockFiles.set(path, content)
  }),
  readdirSync: vi.fn(() =>
    Array.from(mockFiles.keys())
      .filter((k) => k.endsWith('.json'))
      .map((k) => k.split('/').pop()!),
  ),
  unlinkSync: vi.fn((path: string) => {
    mockFiles.delete(path)
  }),
}))

// Mock os
vi.mock('os', () => ({
  default: {
    hostname: vi.fn(() => 'test-host'),
    userInfo: vi.fn(() => ({ username: 'testuser' })),
  },
  hostname: vi.fn(() => 'test-host'),
  userInfo: vi.fn(() => ({ username: 'testuser' })),
}))

describe('Storage Service', () => {
  beforeEach(() => {
    mockFiles.clear()
    vi.clearAllMocks()
    mockSafeStorage.isEncryptionAvailable.mockReturnValue(true)
  })

  describe('credential encryption/decryption', () => {
    it('should encrypt and decrypt a value using safeStorage', async () => {
      const { setApiKey, getApiKey } = await import('../../main/services/storage.js')

      const original = 'sk-test-api-key-12345'
      setApiKey('test-provider', original)
      const decrypted = getApiKey('test-provider')
      expect(decrypted).toBe(original)
    })

    it('should call safeStorage.encryptString when available', async () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(true)

      const { setApiKey } = await import('../../main/services/storage.js')
      setApiKey('test-key-provider', 'my-key')

      expect(mockSafeStorage.encryptString).toHaveBeenCalled()
    })
  })

  describe('AES fallback when safeStorage unavailable', () => {
    it('should use AES fallback when encryption not available', async () => {
      mockSafeStorage.isEncryptionAvailable.mockReturnValue(false)

      const { setApiKey, getApiKey } = await import('../../main/services/storage.js')

      const original = 'my-secret-key'
      setApiKey('aes-provider', original)
      const decrypted = getApiKey('aes-provider')
      expect(decrypted).toBe(original)
    })
  })

  describe('session operations', () => {
    it('should create and list sessions', async () => {
      const { createSession, listSessions } = await import('../../main/services/storage.js')

      const session = createSession({ provider: 'openai', model: 'gpt-4o' })
      expect(session.id).toBeDefined()
      expect(session.provider).toBe('openai')
      expect(session.model).toBe('gpt-4o')

      const sessions = listSessions()
      expect(sessions.length).toBeGreaterThan(0)
    })

    it('should delete a session', async () => {
      const { createSession, deleteSession, listSessions } = await import(
        '../../main/services/storage.js'
      )

      const session = createSession({ provider: 'anthropic', model: 'claude-sonnet' })
      deleteSession(session.id)

      const sessions = listSessions()
      expect(sessions.find((s) => s.id === session.id)).toBeUndefined()
    })
  })

  describe('settings operations', () => {
    it('should get and set settings', async () => {
      const { getSettings, setSettings } = await import('../../main/services/storage.js')

      const initial = getSettings()
      expect(initial.theme).toBeDefined()

      setSettings({ theme: 'light', defaultProvider: 'anthropic' })
      const updated = getSettings()
      expect(updated.theme).toBe('light')
      expect(updated.defaultProvider).toBe('anthropic')
    })
  })

  describe('API key operations', () => {
    it('should store and retrieve API keys', async () => {
      const { setApiKey, getApiKey, deleteApiKey } = await import(
        '../../main/services/storage.js'
      )

      setApiKey('openai', 'sk-test-123')
      const key = getApiKey('openai')
      expect(key).toBe('sk-test-123')

      deleteApiKey('openai')
      expect(getApiKey('openai')).toBeNull()
    })

    it('should return null for missing key', async () => {
      const { getApiKey } = await import('../../main/services/storage.js')
      expect(getApiKey('nonexistent')).toBeNull()
    })
  })
})
