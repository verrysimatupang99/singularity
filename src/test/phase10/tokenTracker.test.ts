import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []), fromWebContents: vi.fn() },
}))

describe('Token Tracker', () => {
  it('record() stores a usage entry', async () => {
    const { tokenTracker } = await import('../../main/services/tokenTracker.js')
    tokenTracker.record({ sessionId: 's1', providerId: 'anthropic', model: 'claude-sonnet', promptTokens: 100, completionTokens: 50, totalTokens: 150, cost: 0.001, timestamp: Date.now() })
    const recent = tokenTracker.getRecentSessions()
    expect(recent.length).toBeGreaterThan(0)
  })

  it('getBySession() filters by sessionId', async () => {
    const { tokenTracker } = await import('../../main/services/tokenTracker.js')
    const before = tokenTracker.getBySession('test-session-unique')
    tokenTracker.record({ sessionId: 'test-session-unique', providerId: 'openai', model: 'gpt-4o', promptTokens: 200, completionTokens: 100, totalTokens: 300, cost: 0.002, timestamp: Date.now() })
    const after = tokenTracker.getBySession('test-session-unique')
    expect(after.length).toBe(before.length + 1)
  })

  it('getTotalToday() aggregates tokens from today', async () => {
    const { tokenTracker } = await import('../../main/services/tokenTracker.js')
    const total = tokenTracker.getTotalToday()
    expect(total).toHaveProperty('tokens')
    expect(total).toHaveProperty('cost')
    expect(typeof total.tokens).toBe('number')
  })

  it('getProviderBreakdown() returns per-provider stats', async () => {
    const { tokenTracker } = await import('../../main/services/tokenTracker.js')
    const breakdown = tokenTracker.getProviderBreakdown()
    expect(typeof breakdown).toBe('object')
  })

  it('cost calculation returns 0 for unknown model', async () => {
    const { calcCost } = await import('../../main/services/tokenTracker.js')
    const cost = calcCost('unknown-model-xyz', 1000, 500)
    expect(cost).toBe(0)
  })

  it('cost is positive for known model', async () => {
    const { calcCost } = await import('../../main/services/tokenTracker.js')
    const cost = calcCost('claude-sonnet-4', 1000, 500)
    expect(cost).toBeGreaterThan(0)
  })

  it('clear() removes all records', async () => {
    const { tokenTracker } = await import('../../main/services/tokenTracker.js')
    tokenTracker.clear()
    const recent = tokenTracker.getRecentSessions()
    expect(recent.length).toBe(0)
  })

  it('getRecentSessions() returns sorted by lastUsed', async () => {
    const { tokenTracker } = await import('../../main/services/tokenTracker.js')
    const sessions = tokenTracker.getRecentSessions(5)
    for (let i = 1; i < sessions.length; i++) {
      expect(sessions[i - 1].lastUsed).toBeGreaterThanOrEqual(sessions[i].lastUsed)
    }
  })
})
