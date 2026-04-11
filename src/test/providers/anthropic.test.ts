import { vi } from 'vitest'

// Mock storage module — must be BEFORE importing the provider
vi.mock('../../main/services/storage.js', () => ({
  getApiKey: vi.fn((provider: string) => {
    if (provider === 'anthropic' || provider === 'openai' || provider === 'openrouter') {
      return 'test-api-key-123'
    }
    return null
  }),
}))

import { AnthropicProvider } from '../../main/providers/anthropic.js'
import { AuthError, CancelledError, ProviderError } from '../../main/providers/types.js'

function mockFetchResponse(status: number, body: string): void {
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
}

function mockFetchReject(error: Error): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(error)))
}

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider

  beforeEach(() => {
    provider = new AnthropicProvider()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('properties', () => {
    it('should have correct id and name', () => {
      expect(provider.id).toBe('anthropic')
      expect(provider.name).toBe('Anthropic Claude')
    })

    it('should support api-key auth method', () => {
      expect(provider.authMethods).toEqual([
        { type: 'api-key', label: 'API Key', description: 'Enter your Anthropic API key' },
      ])
    })
  })

  describe('getModels', () => {
    it('should return non-empty array of models', async () => {
      const models = await provider.getModels()
      expect(models.length).toBeGreaterThan(0)
    })

    it('should include claude-opus, claude-sonnet, claude-haiku', async () => {
      const models = await provider.getModels()
      const ids = models.map((m) => m.id)
      expect(ids.some((id) => id.includes('opus'))).toBe(true)
      expect(ids.some((id) => id.includes('sonnet'))).toBe(true)
      expect(ids.some((id) => id.includes('haiku'))).toBe(true)
    })

    it('should have contextWindow > 0 for all models', async () => {
      const models = await provider.getModels()
      for (const model of models) {
        expect(model.contextWindow).toBeGreaterThan(0)
      }
    })
  })

  describe('chat streaming', () => {
    it('should stream text content from SSE', async () => {
      const sseData = `event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" World"}}

event: message_stop
data: {"type":"message_stop"}
`
      mockFetchResponse(200, sseData)

      const chunks: Array<{ type: string; content: string }> = []
      const result = await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        { model: 'claude-sonnet-4-5-20260318' },
        (chunk) => chunks.push(chunk),
      )

      expect(result.content).toBe('Hello World')
      const textChunks = chunks.filter((c) => c.type === 'text')
      expect(textChunks.length).toBe(2)
      expect(textChunks[0].content).toBe('Hello')
      expect(textChunks[1].content).toBe(' World')
    })

    it('should stream thinking/thought chunks', async () => {
      const sseData = `event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think..."}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Answer"}}

event: message_stop
data: {"type":"message_stop"}
`
      mockFetchResponse(200, sseData)

      const chunks: Array<{ type: string; content: string }> = []
      await provider.chat(
        [{ role: 'user', content: 'Think' }],
        { model: 'claude-opus-4-5-20260318' },
        (chunk) => chunks.push(chunk),
      )

      const thoughtChunks = chunks.filter((c) => c.type === 'thought')
      expect(thoughtChunks.length).toBe(1)
      expect(thoughtChunks[0].content).toBe('Let me think...')
    })

    it('should handle tool_call events', async () => {
      const sseData = `event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"tool_1","name":"read_file","input":{"path":"test.ts"}}}

event: message_stop
data: {"type":"message_stop"}
`
      mockFetchResponse(200, sseData)

      const chunks: Array<{ type: string; toolCall?: unknown }> = []
      await provider.chat(
        [{ role: 'user', content: 'Read file' }],
        { model: 'claude-sonnet-4-5-20260318' },
        (chunk) => chunks.push(chunk),
      )

      const toolChunks = chunks.filter((c) => c.type === 'tool_call')
      expect(toolChunks.length).toBe(1)
      expect((toolChunks[0] as { toolCall?: { name: string } }).toolCall?.name).toBe('read_file')
    })
  })

  describe('cancel', () => {
    it('should register and remove abort controller', async () => {
      // Test that cancel properly cleans up the internal map
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
      mockFetchResponse(401, JSON.stringify({ error: { message: 'Invalid API key' } }))

      await expect(
        provider.chat(
          [{ role: 'user', content: 'Hi' }],
          { model: 'claude-sonnet-4-5-20260318' },
          () => {},
        ),
      ).rejects.toThrow(AuthError)
    })

    it('should throw ProviderError on 529', { timeout: 20000 }, async () => {
      mockFetchResponse(529, JSON.stringify({ error: { message: 'Overloaded' } }))

      await expect(
        provider.chat(
          [{ role: 'user', content: 'Hi' }],
          { model: 'claude-sonnet-4-5-20260318' },
          () => {},
        ),
      ).rejects.toThrow(ProviderError)
    })

    it('should handle malformed SSE data gracefully', async () => {
      const sseData = `event: content_block_delta
data: invalid json{{

event: message_stop
data: {"type":"message_stop"}
`
      mockFetchResponse(200, sseData)

      const chunks: Array<{ type: string; content: string }> = []
      const result = await provider.chat(
        [{ role: 'user', content: 'Hi' }],
        { model: 'claude-sonnet-4-5-20260318' },
        (chunk) => chunks.push(chunk),
      )

      // Should complete without error, skipping unparseable lines
      expect(result).toBeDefined()
    })
  })
})
