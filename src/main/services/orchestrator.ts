import type { SubAgentSpec, SubAgentResult, OrchestratorPlan, OrchestratorEvent } from '../providers/types.js'
import { runAgentLoop } from './agentRunner.js'
import { getApiKey } from './storage.js'
import { BUILT_IN_TOOLS } from './agentTools.js'

export interface OrchestratorOptions {
  orchestratorId: string
  task: string
  workspaceRoot: string
  provider: string
  model: string
  onEvent: (event: OrchestratorEvent) => void
}

function buildWaves(specs: SubAgentSpec[]): SubAgentSpec[][] {
  const waves: SubAgentSpec[][] = []
  const done = new Set<string>()
  let remaining = [...specs]
  while (remaining.length > 0) {
    const wave = remaining.filter(s => !s.dependsOn || s.dependsOn.every(dep => done.has(dep)))
    if (wave.length === 0) throw new Error('Circular dependency detected in sub-agent plan')
    waves.push(wave)
    wave.forEach(s => done.add(s.id))
    remaining = remaining.filter(s => !done.has(s.id))
  }
  return waves
}

export class OrchestratorAgent {
  private opts: OrchestratorOptions
  private results: Map<string, SubAgentResult> = new Map()

  constructor(opts: OrchestratorOptions) { this.opts = opts }

  async plan(task: string): Promise<OrchestratorPlan> {
    const apiKey = getApiKey(this.opts.provider)
    if (!apiKey) throw new Error(`No API key for ${this.opts.provider}`)

    const toolsList = BUILT_IN_TOOLS.map(t => t.name).join(', ')
    const prompt = `You are a task orchestrator. Break this task into parallel sub-tasks.
Respond with ONLY valid JSON:
{"subAgents":[{"id":"agent_0","role":"code_writer","task":"...","tools":["read_file","write_file"],"dependsOn":[],"priority":"normal"}]}
Rules: max 5 sub-agents, each has ONE focused task, use dependsOn only when truly needed, tools must be subset of: ${toolsList}. Minimize dependencies.
Task: ${task}
Workspace: ${this.opts.workspaceRoot}`

    const client = new OpenAI({ apiKey, baseURL: this.opts.provider === 'qwen' ? 'https://dashscope.aliyuncs.com/compatible-mode/v1' : this.opts.provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined })
    const resp = await client.chat.completions.create({ model: this.opts.model, messages: [{ role: 'user', content: prompt }], max_tokens: 1024 })
    const content = resp.choices[0]?.message?.content || ''

    // Try to parse JSON from response (may be wrapped in markdown)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { subAgents: [] }

    return {
      orchestratorId: this.opts.orchestratorId,
      task,
      subAgents: (parsed.subAgents || []).map((s: any, i: number) => ({
        id: s.id || `agent_${i}`,
        role: s.role || 'general',
        task: s.task || task,
        tools: (s.tools || ['read_file']).filter((t: string) => BUILT_IN_TOOLS.some(bt => bt.name === t)),
        dependsOn: s.dependsOn || [],
        priority: s.priority || 'normal',
      })),
      strategy: 'dag',
      estimatedTokens: parsed.subAgents?.length * 5000 || 15000,
    }
  }

  async execute(plan: OrchestratorPlan): Promise<Map<string, SubAgentResult>> {
    const waves = buildWaves(plan.subAgents)
    const failed = new Set<string>()

    for (let w = 0; w < waves.length; w++) {
      const wave = waves[w]
      const results = await Promise.allSettled(wave.map(spec => this.runSubAgent(spec, failed)))

      for (let i = 0; i < wave.length; i++) {
        const spec = wave[i]
        const result = results[i]

        if (result.status === 'rejected') {
          const subResult: SubAgentResult = { id: spec.id, role: spec.role, status: 'error', output: '', filesModified: [], error: result.reason?.message || 'Unknown error', durationMs: 0 }
          this.results.set(spec.id, subResult)
          this.opts.onEvent({ orchestratorId: this.opts.orchestratorId, type: 'subagent_error', subAgentId: spec.id, result: subResult })
          failed.add(spec.id)
        } else if (result.status === 'fulfilled') {
          this.results.set(spec.id, result.value)
          this.opts.onEvent({ orchestratorId: this.opts.orchestratorId, type: 'subagent_done', subAgentId: spec.id, result: result.value })
        }
      }
    }

    // Mark skipped agents
    for (const spec of plan.subAgents) {
      if (!this.results.has(spec.id)) {
        const subResult: SubAgentResult = { id: spec.id, role: spec.role, status: 'skipped', output: '', filesModified: [], durationMs: 0 }
        this.results.set(spec.id, subResult)
        this.opts.onEvent({ orchestratorId: this.opts.orchestratorId, type: 'subagent_skipped', subAgentId: spec.id, result: subResult })
      }
    }

    this.opts.onEvent({ orchestratorId: this.opts.orchestratorId, type: 'done', summary: `${this.results.size} sub-agents completed` })
    return this.results
  }

  private async runSubAgent(spec: SubAgentSpec, failed: Set<string>): Promise<SubAgentResult> {
    const startTime = Date.now()
    this.opts.onEvent({ orchestratorId: this.opts.orchestratorId, type: 'subagent_start', subAgentId: spec.id, subAgent: spec })

    const subAgentId = `sub_${spec.id}_${Date.now()}`
    let output = ''
    let filesModified: string[] = []
    let error: string | undefined

    await runAgentLoop({
      agentId: subAgentId,
      task: spec.task,
      workspaceRoot: this.opts.workspaceRoot,
      provider: this.opts.provider,
      model: this.opts.model,
      onEvent: (event) => {
        if (event.type === 'tool_result' && event.result?.toolName === 'write_file') {
          const path = event.result.args?.path as string | undefined
          if (path) filesModified.push(path)
        }
        if (event.type === 'done') output = event.finalResponse || ''
        if (event.type === 'error') error = event.error
      },
    })

    return {
      id: spec.id,
      role: spec.role,
      status: error ? 'error' : 'done',
      output,
      filesModified: [...new Set(filesModified)],
      error,
      durationMs: Date.now() - startTime,
    }
  }
}
