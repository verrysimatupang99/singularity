import { describe, it, expect, vi } from 'vitest'

// Mock fs and os for agentMemory
vi.mock('fs', () => ({
  readFileSync: vi.fn(() => '[]'),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}))
vi.mock('os', () => ({ homedir: vi.fn(() => '/tmp/test') }))
vi.mock('path', () => ({ join: vi.fn((...a: string[]) => a.join('/')), dirname: vi.fn((p: string) => p.split('/').slice(0, -1).join('/')) }))

describe('Agent Memory', () => {
  it('remember() stores and recall() finds entry', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.remember('api_endpoint', 'https://api.example.com/v2', ['config', 'api'])
    const results = mem.recall('api')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].key).toBe('api_endpoint')
    expect(results[0].value).toBe('https://api.example.com/v2')
  })

  it('upsert updates existing key', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.remember('key1', 'value1')
    mem.remember('key1', 'value2')
    expect(mem.recall('key1')[0].value).toBe('value2')
    expect(mem.getAll().filter(e => e.key === 'key1').length).toBe(1)
  })

  it('forget() removes entry', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.remember('temp', 'data')
    expect(mem.recall('temp').length).toBeGreaterThan(0)
    mem.forget('temp')
    expect(mem.recall('temp').length).toBe(0)
  })

  it('recall() returns max limit results', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    for (let i = 0; i < 10; i++) mem.remember(`item_${i}`, `value ${i}`, ['test'])
    const results = mem.recall('item', 3)
    expect(results.length).toBe(3)
  })

  it('recall sorts by timestamp descending', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.remember('old', 'old value', ['test'])
    await new Promise(r => setTimeout(r, 10))
    mem.remember('new', 'new value', ['test'])
    const results = mem.recall('test')
    expect(results[0].key).toBe('new')
  })

  it('getAll returns all entries', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.remember('a', '1')
    mem.remember('b', '2')
    expect(mem.getAll().length).toBeGreaterThanOrEqual(2)
  })
})
