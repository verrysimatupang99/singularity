interface UsageRecord {
  sessionId: string
  providerId: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost: number
  timestamp: number
}

const PROVIDER_PRICING: Record<string, { input: number; output: number }> = {
  'claude': { input: 3.00, output: 15.00 },
  'sonnet': { input: 3.00, output: 15.00 },
  'opus': { input: 15.00, output: 75.00 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gemini': { input: 0.075, output: 0.30 },
  'gemini-2.0': { input: 0.075, output: 0.30 },
  'qwen': { input: 0.01, output: 0.05 },
  'openrouter': { input: 1.00, output: 5.00 },
}

function calcCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = Object.entries(PROVIDER_PRICING).find(([key]) => model.toLowerCase().includes(key))
  if (!pricing) return 0
  const perM = 1_000_000
  return (promptTokens / perM) * pricing[1].input + (completionTokens / perM) * pricing[1].output
}

class TokenTracker {
  private records: UsageRecord[] = []

  record(rec: UsageRecord): void { this.records.push(rec) }

  getBySession(sessionId: string): UsageRecord[] { return this.records.filter(r => r.sessionId === sessionId) }
  getByProvider(providerId: string): UsageRecord[] { return this.records.filter(r => r.providerId === providerId) }

  getTotalToday(): { tokens: number; cost: number } {
    const now = Date.now()
    const dayStart = now - 24 * 60 * 60 * 1000
    const today = this.records.filter(r => r.timestamp >= dayStart)
    return { tokens: today.reduce((s, r) => s + r.totalTokens, 0), cost: today.reduce((s, r) => s + r.cost, 0) }
  }

  getTotalThisMonth(): { tokens: number; cost: number } {
    const now = Date.now()
    const monthStart = now - 30 * 24 * 60 * 60 * 1000
    const month = this.records.filter(r => r.timestamp >= monthStart)
    return { tokens: month.reduce((s, r) => s + r.totalTokens, 0), cost: month.reduce((s, r) => s + r.cost, 0) }
  }

  getProviderBreakdown(): Record<string, { tokens: number; cost: number }> {
    const breakdown: Record<string, { tokens: number; cost: number }> = {}
    for (const r of this.records) {
      if (!breakdown[r.providerId]) breakdown[r.providerId] = { tokens: 0, cost: 0 }
      breakdown[r.providerId].tokens += r.totalTokens
      breakdown[r.providerId].cost += r.cost
    }
    return breakdown
  }

  getRecentSessions(limit: number = 10): Array<{ sessionId: string; tokens: number; cost: number; lastUsed: number }> {
    const bySession: Record<string, { tokens: number; cost: number; lastUsed: number }> = {}
    for (const r of this.records) {
      if (!bySession[r.sessionId]) bySession[r.sessionId] = { tokens: 0, cost: 0, lastUsed: 0 }
      bySession[r.sessionId].tokens += r.totalTokens
      bySession[r.sessionId].cost += r.cost
      bySession[r.sessionId].lastUsed = Math.max(bySession[r.sessionId].lastUsed, r.timestamp)
    }
    return Object.entries(bySession).map(([sessionId, data]) => ({ sessionId, ...data })).sort((a, b) => b.lastUsed - a.lastUsed).slice(0, limit)
  }

  clear(): void { this.records = [] }
}

export const tokenTracker = new TokenTracker()
export { calcCost }
