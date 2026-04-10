import { vi } from 'vitest'
import * as storage from '../../main/services/storage.js'

vi.mock('../../main/services/storage.js', () => ({
  getApiKey: vi.fn(() => null),
}))

const getApiKeyMock = vi.mocked(storage.getApiKey)

import { GitHubCopilotProvider } from '../../main/providers/github-copilot.js'
import { AuthError } from '../../main/providers/types.js'

function mockSseResponse(status: number, lines: string[]): Response {
  const body = lines.join('\n') + '\n'
  const response = new Response(body, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  })
  Object.defineProperty(response, 'body', {
    value: new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(body))
        controller.close()
      },
    }),
  })
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(response)))
  return response
}

describe('GitHubCopilotProvider', () => {
  let provider: GitHubCopilotProvider

  beforeEach(() => {
    provider = new GitHubCopilotProvider()
    vi.unstubAllGlobals()
    getApiKeyMock.mockClear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    getApiKeyMock.mockClear()
  })

  describe('properties', () => {
    it('should have correct id and name', () => {
      expect(provider.id).toBe('github-copilot')
      expect(provider.name).toBe('GitHub Copilot')
    })

    it('should use device-flow auth method', () => {
      expect(provider.authMethods).toHaveLength(1)
      expect(provider.authMethods[0].type).toBe('device-flow')
      expect(provider.authMethods[0].label).toBe('GitHub OAuth')
    })
  })

  describe('isAvailable', () => {
    it('should return false without stored token', async () => {
      getApiKeyMock.mockReturnValue(null)
      expect(await provider.isAvailable()).toBe(false)
    })

    it('should return true with stored token', async () => {
      getApiKeyMock.mockReturnValue('test-copilot-token-abc')
      expect(await provider.isAvailable()).toBe(true)
    })
  })

  describe('getModels', () => {
    it('should return 4 copilot models', async () => {
      const models = await provider.getModels()
      expect(models).toHaveLength(4)
    })

    it('should include gpt-4.1', async () => {
      const models = await provider.getModels()
      const gpt41 = models.find((m) => m.id === 'gpt-4.1')
      expect(gpt41).toBeDefined()
      expect(gpt41?.name).toBe('GPT-4.1 (Copilot)')
      expect(gpt41?.contextWindow).toBe(1047576)
      expect(gpt41?.supportsTools).toBe(true)
      expect(gpt41?.supportsVision).toBe(true)
    })

    it('should include claude-sonnet-4-20250514', async () => {
      const models = await provider.getModels()
      const claude = models.find((m) => m.id === 'claude-sonnet-4-20250514')
      expect(claude).toBeDefined()
      expect(claude?.contextWindow).toBe(200000)
      expect(claude?.maxOutputTokens).toBe(16000)
    })

    it('should include gemini-2.5-pro', async () => {
      const models = await provider.getModels()
      const gemini = models.find((m) => m.id === 'gemini-2.5-pro')
      expect(gemini).toBeDefined()
      expect(gemini?.supportsReasoning).toBe(true)
    })

    it('should include o3', async () => {
      const models = await provider.getModels()
      const o3 = models.find((m) => m.id === 'o3')
      expect(o3).toBeDefined()
      expect(o3?.supportsVision).toBe(false)
      expect(o3?.supportsReasoning).toBe(true)
    })
  })

  describe('chat streaming', () => {
    it('should stream text content from SSE', async () => {
      getApiKeyMock.mockReturnValue('test-copilot-token-abc')
      const sseLines = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" World"}}]}',
        'data: [DONE]',
      ]
      mockSseResponse(200, sseLines)

      const chunks: Array<{ type: string; content: string }> = []
      const result = await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        { model: 'gpt-4.1' },
        (chunk) => chunks.push(chunk),
      )

      expect(result.content).toBe('Hello World')
      expect(chunks.filter((c) => c.type === 'text').length).toBe(2)
    })

    it('should throw AuthError when no API key', async () => {
      getApiKeyMock.mockReturnValue(null)

      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], { model: 'gpt-4.1' }, () => {}),
      ).rejects.toThrow(AuthError)
    })
  })

  describe('cancel', () => {
    it('should register and remove abort controller', () => {
      const controller = new AbortController()
      provider['abortControllers'].set('test-id', controller)
      expect(provider['abortControllers'].has('test-id')).toBe(true)

      provider.cancel('test-id')
      expect(controller.signal.aborted).toBe(true)
      expect(provider['abortControllers'].has('test-id')).toBe(false)
    })

    it('should not throw when cancelling non-existent request', () => {
      expect(() => provider.cancel('non-existent')).not.toThrow()
    })
  })
})
