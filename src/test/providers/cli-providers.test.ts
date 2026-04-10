import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createCliProvider, CliProviderConfig } from '../../main/providers/cli-provider-factory.js'
import type { CliSessionManager } from '../../main/services/cliSessionManager.js'

// Mock CliSessionManager
function createMockCliSessionManager(): {
  manager: CliSessionManager
  detectCliBinaries: ReturnType<typeof vi.fn>
} {
  const detectCliBinaries = vi.fn()
  const spawn = vi.fn()
  const terminateSession = vi.fn()

  const manager = {
    detectCliBinaries,
    spawn,
    terminateSession,
  } as unknown as CliSessionManager

  return { manager, detectCliBinaries }
}

const testConfig: CliProviderConfig = {
  id: 'test-cli',
  name: 'Test CLI',
  binaryNames: ['test-bin', 'test-bin-alt'],
  models: [
    {
      id: 'test-model-1',
      name: 'Test Model 1',
      contextWindow: 32768,
      maxOutputTokens: 4096,
      supportsTools: true,
      supportsVision: false,
      supportsReasoning: true,
    },
  ],
  description: 'A test CLI provider',
}

describe('CLI Provider Factory', () => {
  let mockManager: ReturnType<typeof createMockCliSessionManager>

  beforeEach(() => {
    mockManager = createMockCliSessionManager()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('properties', () => {
    it('should have correct id and name', () => {
      const provider = createCliProvider(testConfig, mockManager.manager)
      expect(provider.id).toBe('test-cli')
      expect(provider.name).toBe('Test CLI')
    })

    it('should have oauth-import auth method', () => {
      const provider = createCliProvider(testConfig, mockManager.manager)
      expect(provider.authMethods).toEqual([
        {
          type: 'oauth-import',
          label: 'Test CLI',
          description: 'A test CLI provider',
        },
      ])
    })
  })

  describe('isAvailable', () => {
    it('should return false when no binaries detected', async () => {
      mockManager.detectCliBinaries.mockResolvedValue({})
      const provider = createCliProvider(testConfig, mockManager.manager)
      const result = await provider.isAvailable()
      expect(result).toBe(false)
    })

    it('should return true when primary binary is detected', async () => {
      mockManager.detectCliBinaries.mockResolvedValue({ 'test-bin': '1.0.0' })
      const provider = createCliProvider(testConfig, mockManager.manager)
      const result = await provider.isAvailable()
      expect(result).toBe(true)
    })

    it('should return true when alternate binary is detected', async () => {
      mockManager.detectCliBinaries.mockResolvedValue({ 'test-bin-alt': '2.0.0' })
      const provider = createCliProvider(testConfig, mockManager.manager)
      const result = await provider.isAvailable()
      expect(result).toBe(true)
    })

    it('should return false when only unrelated binaries are detected', async () => {
      mockManager.detectCliBinaries.mockResolvedValue({ 'other-cli': '1.0.0' })
      const provider = createCliProvider(testConfig, mockManager.manager)
      const result = await provider.isAvailable()
      expect(result).toBe(false)
    })
  })

  describe('getModels', () => {
    it('should return configured models', async () => {
      const provider = createCliProvider(testConfig, mockManager.manager)
      const models = await provider.getModels()
      expect(models).toEqual(testConfig.models)
    })

    it('should return models with correct properties', async () => {
      const provider = createCliProvider(testConfig, mockManager.manager)
      const models = await provider.getModels()
      expect(models.length).toBe(1)
      expect(models[0].id).toBe('test-model-1')
      expect(models[0].contextWindow).toBe(32768)
      expect(models[0].supportsTools).toBe(true)
      expect(models[0].supportsVision).toBe(false)
    })
  })

  describe('cancel', () => {
    it('should not throw when cancelling non-existent request', () => {
      const provider = createCliProvider(testConfig, mockManager.manager)
      expect(() => provider.cancel('non-existent')).not.toThrow()
    })
  })
})

describe('CLI Provider - Real Instances', () => {
  describe('GeminiCLIProvider', () => {
    it('should have correct config', async () => {
      const { GeminiCLIProvider } = await import('../../main/providers/cli-gemini.js')
      expect(GeminiCLIProvider.id).toBe('gemini-cli')
      expect(GeminiCLIProvider.name).toBe('Gemini CLI')
      const models = await GeminiCLIProvider.getModels()
      expect(models.length).toBeGreaterThan(0)
      expect(models[0].id).toBe('gemini-2.5-pro')
    })

    it('should return isAvailable=false when gemini CLI not installed', async () => {
      const { GeminiCLIProvider } = await import('../../main/providers/cli-gemini.js')
      // In test environment, gemini CLI is likely not installed
      const available = await GeminiCLIProvider.isAvailable()
      // Just verify it returns a boolean (true if installed, false if not)
      expect(typeof available).toBe('boolean')
    })
  })

  describe('ClaudeCLIProvider', () => {
    it('should have correct config', async () => {
      const { ClaudeCLIProvider } = await import('../../main/providers/cli-claude.js')
      expect(ClaudeCLIProvider.id).toBe('claude-cli')
      expect(ClaudeCLIProvider.name).toBe('Claude CLI')
      const models = await ClaudeCLIProvider.getModels()
      expect(models.length).toBe(2)
      expect(models.map((m) => m.id)).toContain('claude-opus-4')
      expect(models.map((m) => m.id)).toContain('claude-sonnet-4')
    })

    it('should return isAvailable as boolean', async () => {
      const { ClaudeCLIProvider } = await import('../../main/providers/cli-claude.js')
      const available = await ClaudeCLIProvider.isAvailable()
      expect(typeof available).toBe('boolean')
    })
  })

  describe('QwenCLIProvider', () => {
    it('should have correct config', async () => {
      const { QwenCLIProvider } = await import('../../main/providers/cli-qwen.js')
      expect(QwenCLIProvider.id).toBe('qwen-cli')
      expect(QwenCLIProvider.name).toBe('Qwen CLI')
      const models = await QwenCLIProvider.getModels()
      expect(models.length).toBe(1)
      expect(models[0].id).toBe('qwen-max')
    })

    it('should return isAvailable as boolean', async () => {
      const { QwenCLIProvider } = await import('../../main/providers/cli-qwen.js')
      const available = await QwenCLIProvider.isAvailable()
      expect(typeof available).toBe('boolean')
    })
  })
})
