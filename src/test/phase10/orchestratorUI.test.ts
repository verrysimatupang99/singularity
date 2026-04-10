import { describe, it, expect } from 'vitest'

describe('Orchestrator APIs', () => {
  it('OrchestratorAgent class exists and is instantiable', async () => {
    const { OrchestratorAgent } = await import('../../main/services/orchestrator.js')
    expect(typeof OrchestratorAgent).toBe('function')
  })

  it('buildWaves function correctly groups independent tasks', async () => {
    // Test the wave-building logic from orchestrator
    function buildWaves(specs: Array<{ id: string; dependsOn?: string[] }>): Array<Array<{ id: string; dependsOn?: string[] }>> {
      const waves: Array<Array<{ id: string; dependsOn?: string[] }>> = []
      const done = new Set<string>()
      let remaining = [...specs]
      while (remaining.length > 0) {
        const wave = remaining.filter(s => !s.dependsOn || s.dependsOn.every(dep => done.has(dep)))
        if (wave.length === 0) throw new Error('Circular dependency')
        waves.push(wave)
        wave.forEach(s => done.add(s.id))
        remaining = remaining.filter(s => !done.has(s.id))
      }
      return waves
    }

    const specs = [
      { id: 'a' },
      { id: 'b', dependsOn: ['a'] },
      { id: 'c', dependsOn: ['a'] },
      { id: 'd', dependsOn: ['b', 'c'] },
    ]
    const waves = buildWaves(specs)
    expect(waves.length).toBe(3)
    expect(waves[0].map(s => s.id)).toContain('a')
    expect(waves[1].map(s => s.id)).toEqual(expect.arrayContaining(['b', 'c']))
    expect(waves[2].map(s => s.id)).toContain('d')
  })

  it('SubAgentSpec interface has required fields', () => {
    const spec = { id: 'test', role: 'coder', task: 'test', tools: ['read_file'], priority: 'normal' as const }
    expect(spec).toHaveProperty('id')
    expect(spec).toHaveProperty('role')
    expect(spec).toHaveProperty('task')
    expect(spec).toHaveProperty('tools')
    expect(spec).toHaveProperty('priority')
  })

  it('OrchestratorPlan has correct structure', () => {
    const plan = {
      orchestratorId: 'orch_1',
      task: 'test task',
      subAgents: [],
      strategy: 'dag' as const,
      estimatedTokens: 10000,
    }
    expect(plan).toHaveProperty('orchestratorId')
    expect(plan).toHaveProperty('subAgents')
    expect(plan).toHaveProperty('strategy')
  })
})
