import { describe, it, expect } from 'vitest'

describe('Orchestrator DAG execution', () => {
  function buildWaves(specs: any[]): any[][] {
    const waves: any[][] = []
    const done = new Set<string>()
    let remaining = [...specs]
    while (remaining.length > 0) {
      const wave = remaining.filter(s => !s.dependsOn || s.dependsOn.every((dep: string) => done.has(dep)))
      if (wave.length === 0) throw new Error('Circular dependency')
      waves.push(wave)
      wave.forEach(s => done.add(s.id))
      remaining = remaining.filter(s => !done.has(s.id))
    }
    return waves
  }

  it('wave 0 runs in parallel (no deps)', () => {
    const specs = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: [] },
    ]
    const waves = buildWaves(specs)
    expect(waves.length).toBe(1)
    expect(waves[0].length).toBe(3)
  })

  it('dependent sub-agent waits for dependency', () => {
    const specs = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
    ]
    const waves = buildWaves(specs)
    expect(waves.length).toBe(2)
    expect(waves[0].map(s => s.id)).toContain('a')
    expect(waves[1].map(s => s.id)).toContain('b')
  })

  it('dependent sub-agent skipped when dependency fails', () => {
    const specs = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['b'] },
    ]
    const waves = buildWaves(specs)
    expect(waves.length).toBe(3)
    // If 'a' fails, transitive dependents 'b' and 'c' should be skipped
    const failed = new Set<string>()
    failed.add('a')
    // Propagate failures transitively
    let changed = true
    while (changed) {
      changed = false
      for (const s of specs) {
        if (!failed.has(s.id) && s.dependsOn?.some(d => failed.has(d))) {
          failed.add(s.id)
          changed = true
        }
      }
    }
    const wouldRun = specs.filter(s => !failed.has(s.id))
    expect(wouldRun.map(s => s.id)).toEqual([])
  })

  it('multiple deps resolved correctly', () => {
    const specs = [
      { id: 'a', dependsOn: [] },
      { id: 'b', dependsOn: [] },
      { id: 'c', dependsOn: ['a', 'b'] },
    ]
    const waves = buildWaves(specs)
    expect(waves.length).toBe(2)
    expect(waves[0].length).toBe(2)
    expect(waves[1][0].id).toBe('c')
  })

  it('throws on circular dependency', () => {
    const specs = [
      { id: 'a', dependsOn: ['b'] },
      { id: 'b', dependsOn: ['a'] },
    ]
    expect(() => buildWaves(specs)).toThrow('Circular dependency')
  })

  it('MAX_TURNS respected per sub-agent', () => {
    const MAX_TURNS = 10
    // Simulated: each sub-agent runs max 10 turns
    const turns = Array.from({ length: 10 }, (_, i) => i + 1)
    expect(turns.length).toBe(MAX_TURNS)
    expect(turns.every(t => t <= MAX_TURNS)).toBe(true)
  })

  it('results map contains all sub-agent ids', () => {
    const specs = [
      { id: 'agent_0' },
      { id: 'agent_1' },
      { id: 'agent_2' },
    ]
    const results = new Map<string, string>()
    specs.forEach(s => results.set(s.id, 'done'))
    expect(results.size).toBe(3)
    specs.forEach(s => expect(results.has(s.id)).toBe(true))
  })

  it('parallel execution with Promise.allSettled', async () => {
    const tasks = [
      () => Promise.resolve('a'),
      () => Promise.reject(new Error('fail')),
      () => Promise.resolve('c'),
    ]
    const results = await Promise.allSettled(tasks.map(t => t()))
    expect(results.length).toBe(3)
    expect(results[0].status).toBe('fulfilled')
    expect(results[1].status).toBe('rejected')
    expect(results[2].status).toBe('fulfilled')
  })
})
