import { describe, it, expect, vi } from 'vitest'

vi.mock('fs', () => ({
  readFileSync: vi.fn(() => '[]'),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
}))
vi.mock('os', () => ({ homedir: vi.fn(() => '/tmp/test') }))
vi.mock('path', () => ({ join: vi.fn((...a: string[]) => a.join('/')) }))

describe('Memory Browser', () => {
  it('memory:list IPC returns all entries', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.remember('test-key-1', 'test-value-1', ['test'])
    const entries = mem.getAll()
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.some(e => e.key === 'test-key-1')).toBe(true)
  })

  it('memory:delete removes entry by key', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.remember('delete-test-key', 'value')
    expect(mem.recall('delete-test-key').length).toBeGreaterThan(0)
    mem.forget('delete-test-key')
    expect(mem.recall('delete-test-key').length).toBe(0)
  })

  it('memory:update changes content', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.remember('update-test-key', 'original')
    const entry = mem.recall('update-test-key')[0]
    mem.update(entry.id, 'updated-value')
    const updated = mem.recall('update-test-key')[0]
    expect(updated.value).toBe('updated-value')
  })

  it('memory:search filters by query', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.remember('typescript-config', 'Use strict mode', ['config'])
    mem.remember('python-config', 'Use ruff linter', ['config'])
    const tsResults = mem.search('typescript')
    const pyResults = mem.search('python')
    expect(tsResults.some(r => r.key === 'typescript-config')).toBe(true)
    expect(pyResults.some(r => r.key === 'python-config')).toBe(true)
  })

  it('memory:clear removes all entries', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.clearAll()
    expect(mem.getAll().length).toBe(0)
  })

  it('deleteById removes specific entry', async () => {
    const { AgentMemory } = await import('../../main/services/agentMemory.js')
    const mem = new AgentMemory()
    mem.remember('delete-by-id-key', 'value')
    const entry = mem.recall('delete-by-id-key')[0]
    mem.deleteById(entry.id)
    expect(mem.recall('delete-by-id-key').length).toBe(0)
  })
})
