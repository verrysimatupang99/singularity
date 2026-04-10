import { vi } from 'vitest'

// Mock storage
vi.mock('../../main/services/storage.js', () => ({
  getApiKey: vi.fn((provider: string) => {
    if (provider === 'openai' || provider === 'openrouter') {
      return 'test-api-key-123'
    }
    return null
  }),
}))

import { OpenAIProvider } from '../../main/providers/openai.js'
import { OpenRouterProvider } from '../../main/providers/openrouter.js'
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

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider

  beforeEach(() => {
    provider = new OpenAIProvider()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('properties', () => {
    it('should have correct id', () => {
      expect(provider.id).toBe('openai')
      expect(provider.name).toBe('OpenAI')
    })
  })

  describe('isAvailable', () => {
    it('should return true when API key exists', async () => {
      expect(await provider.isAvailable()).toBe(true)
    })
  })

  describe('getModels', () => {
    it('should return all expected models', async () => {
      const models = await provider.getModels()
      const ids = models.map((m) => m.id)
      expect(ids).toContain('gpt-4.1')
      expect(ids).toContain('gpt-4o')
      expect(ids).toContain('gpt-4o-mini')
      expect(ids).toContain('o3')
      expect(ids).toContain('o4-mini')
      expect(models.length).toBe(7)
    })
  })

  describe('chat streaming', () => {
    it('should stream text content from SSE', async () => {
      const sseLines = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}',
        'data: {"choices":[{"delta":{"content":" World"}}]}',
        'data: [DONE]',
      ]
      mockSseResponse(200, sseLines)

      const chunks: Array<{ type: string; content: string }> = []
      const result = await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        { model: 'gpt-4o' },
        (chunk) => chunks.push(chunk),
      )

      expect(result.content).toBe('Hello World')
      expect(chunks.filter((c) => c.type === 'text').length).toBe(2)
    })

    it('should stream reasoning_content as thought type', async () => {
      const sseLines = [
        'data: {"choices":[{"delta":{"reasoning_content":"Thinking...","content":""}}]}',
        'data: {"choices":[{"delta":{"content":"Answer"}}]}',
        'data: [DONE]',
      ]
      mockSseResponse(200, sseLines)

      const chunks: Array<{ type: string; content: string }> = []
      await provider.chat(
        [{ role: 'user', content: 'Think' }],
        { model: 'o3' },
        (chunk) => chunks.push(chunk),
      )

      const thoughts = chunks.filter((c) => c.type === 'thought')
      expect(thoughts.length).toBe(1)
      expect(thoughts[0].content).toBe('Thinking...')
    })

    it('should handle tool_calls in delta', async () => {
      const sseLines = [
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"tc_1","function":{"name":"read_file","arguments":"{\\"path\\":\\"test.ts\\"}"}}]}}]}',
        'data: [DONE]',
      ]
      mockSseResponse(200, sseLines)

      const chunks: Array<{ type: string; toolCall?: { name: string } }> = []
      await provider.chat(
        [{ role: 'user', content: 'Read' }],
        { model: 'gpt-4o' },
        (chunk) => chunks.push(chunk),
      )

      const toolChunks = chunks.filter((c) => c.type === 'tool_call')
      expect(toolChunks.length).toBe(1)
      expect(toolChunks[0].toolCall?.name).toBe('read_file')
    })
  })

  describe('cancel', () => {
    it('should register and remove abort controller', async () => {
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

  describe('error handling', () => {
    it('should throw AuthError on 401', async () => {
      mockSseResponse(401, ['data: {"error":{"message":"Invalid key"}}'])

      await expect(
        provider.chat([{ role: 'user', content: 'Hi' }], { model: 'gpt-4o' }, () => {}),
      ).rejects.toThrow(AuthError)
    })
  })
})

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider

  beforeEach(() => {
    provider = new OpenRouterProvider()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('properties', () => {
    it('should have correct id and baseUrl', () => {
      expect(provider.id).toBe('openrouter')
      expect(provider.name).toBe('OpenRouter')
    })
  })

  describe('getModels', () => {
    it('should return default models when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network error'))))

      const models = await provider.getModels()
      expect(models.length).toBeGreaterThan(0)
      expect(models.some((m) => m.id.includes('gpt-4o'))).toBe(true)
    })

    it('should parse fetched models', async () => {
      const body = JSON.stringify({
        data: [
          {
            id: 'openai/gpt-4o',
            name: 'GPT-4o',
            context_length: 128000,
            max_completion_tokens: 16384,
          },
        ],
      })
      mockSseResponse(200, [body])

      const models = await provider.getModels()
      expect(models.length).toBeGreaterThan(0)
    })

    it('should cache models for 1 hour', async () => {
      const fetchSpy = vi.fn().mockImplementation(async () => {
        const response = new Response(JSON.stringify({ data: [] }), {
          headers: { 'Content-Type': 'application/json' },
        })
        Object.defineProperty(response, 'body', { value: null })
        return response
      })
      vi.stubGlobal('fetch', fetchSpy)

      await provider.getModels()
      await provider.getModels()
      // Should only call fetch once due to caching
      expect(fetchSpy).toHaveBeenCalledTimes(1)
    })
  })
})
