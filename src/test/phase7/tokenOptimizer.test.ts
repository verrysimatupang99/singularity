import { describe, it, expect, vi } from 'vitest'

// Mock storage for TokenOptimizer
vi.mock('../../main/services/storage.js', () => ({
  getApiKey: vi.fn(() => null), // No API key for most tests
}))

describe('Token Optimizer', () => {
  describe('truncateToFit', () => {
    it('reduces message count when over limit', async () => {
      const { TokenOptimizer } = await import('../../main/services/tokenOptimizer.js')
      const opt = new TokenOptimizer()
      const messages = Array.from({ length: 30 }, (_, i) => ({
        id: `m${i}`, role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
        content: `Message ${i} with some content that takes up tokens`.repeat(20),
        timestamp: Date.now(),
      }))
      const systemMsg = { id: 'sys', role: 'system' as const, content: 'You are an AI assistant', timestamp: Date.now() }
      const allMessages = [systemMsg, ...messages]

      const result = opt.truncateToFit(allMessages, 5000)
      expect(result.length).toBeLessThan(allMessages.length)
      // System message should always be kept
      expect(result[0].role).toBe('system')
    })

    it('keeps last messages + system', async () => {
      const { TokenOptimizer } = await import('../../main/services/tokenOptimizer.js')
      const opt = new TokenOptimizer()
      const messages = [
        { id: 'sys', role: 'system' as const, content: 'System prompt', timestamp: Date.now() },
        { id: 'm1', role: 'user' as const, content: 'Old message 1', timestamp: Date.now() },
        { id: 'm2', role: 'assistant' as const, content: 'Old response 1', timestamp: Date.now() },
        { id: 'm3', role: 'user' as const, content: 'Recent question', timestamp: Date.now() },
        { id: 'm4', role: 'assistant' as const, content: 'Recent answer', timestamp: Date.now() },
      ]
      // 5000 tokens is plenty for 5 short messages
      const result = opt.truncateToFit(messages, 5000)
      expect(result.length).toBe(5)
    })

    it('returns original when already under limit', async () => {
      const { TokenOptimizer } = await import('../../main/services/tokenOptimizer.js')
      const opt = new TokenOptimizer()
      const messages = [{ id: 'm1', role: 'user' as const, content: 'Short message', timestamp: Date.now() }]
      const result = opt.truncateToFit(messages, 50000)
      expect(result).toEqual(messages)
    })
  })

  describe('deduplicateFileAttachments', () => {
    it('keeps only latest copy of duplicate files', async () => {
      const { TokenOptimizer } = await import('../../main/services/tokenOptimizer.js')
      const opt = new TokenOptimizer()
      const messages = [
        { id: 'm1', role: 'user' as const, content: 'First', timestamp: Date.now(), attachments: [{ name: 'app.ts', content: 'v1' }] },
        { id: 'm2', role: 'assistant' as const, content: 'Response', timestamp: Date.now(), attachments: [] },
        { id: 'm3', role: 'user' as const, content: 'Update', timestamp: Date.now(), attachments: [{ name: 'app.ts', content: 'v2' }] },
      ] as any[]
      const result = opt.deduplicateFileAttachments(messages)
      expect(result[0].attachments.length).toBe(0)  // first app.ts removed
      expect(result[2].attachments.length).toBe(1)  // second app.ts kept
    })
  })

  describe('estimate', () => {
    it('returns reasonable token count', async () => {
      const messages = [
        { content: 'Hello world' },
        { content: 'This is a longer message with more tokens to estimate.' },
      ]
      const chars = messages.reduce((sum, m) => sum + m.content.length, 0)
      const estimated = Math.ceil(chars / 4)
      expect(estimated).toBeGreaterThan(0)
      expect(estimated).toBeLessThan(100)
    })
  })
})
