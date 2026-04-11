import { ipcMain, app } from 'electron'
import path from 'path'
import os from 'os'
import { runAgentLoop, approveAgent } from '../services/agentRunner.js'
import { OrchestratorAgent } from '../services/orchestrator.js'

const activeOrchestrators = new Map<string, OrchestratorAgent>()

let _safeSend: ((channel: string, ...args: unknown[]) => void) | null = null
export function setSafeSend(fn: (channel: string, ...args: unknown[]) => void): void { _safeSend = fn }
function safeSend(channel: string, ...args: unknown[]): void { if (_safeSend) _safeSend(channel, ...args) }

function validateString(input: unknown, maxLen = 100_000): string {
  if (typeof input !== 'string') throw new Error('Expected string input')
  if (input.length > maxLen) throw new Error(`Input too long (max ${maxLen})`)
  return input
}

function sanitizePath(input: unknown): string {
  const p = validateString(input, 4096)
  const resolved = path.resolve(p)
  const home = os.homedir()
  const userData = app.getPath('userData')
  if (!resolved.startsWith(home) && !resolved.startsWith(userData)) throw new Error('Path traversal denied')
  return resolved
}

export function registerAgentIpc(): void {
  // Agent
  ipcMain.handle('agent:executeTask', async (_event, { task, workspaceRoot, provider, model }: {
    task: string; workspaceRoot: string; provider: string; model: string
  }) => {
    const safeTask = validateString(task, 100_000)
    const safeRoot = sanitizePath(workspaceRoot)
    const safeProvider = validateString(provider, 50)
    const safeModel = validateString(model, 200)
    const agentId = `agent_${Date.now()}`
    ;(async () => {
      try {
        await runAgentLoop({ agentId, task: safeTask, workspaceRoot: safeRoot, provider: safeProvider, model: safeModel, onEvent: (event) => safeSend('agent:event', event) })
      } catch (err: any) {
        safeSend('agent:error', { agentId, error: err.message })
      }
    })()
    return { agentId }
  })

  ipcMain.handle('agent:approve', (_event, { agentId, approved }: { agentId: string; approved: boolean }) => {
    approveAgent(agentId, approved)
    return { ok: true }
  })

  // Orchestrator
  ipcMain.handle('orchestrator:plan', async (_event, { task, workspaceRoot, provider, model }: {
    task: string; workspaceRoot: string; provider: string; model: string
  }) => {
    const safeTask = validateString(task, 100_000)
    const safeRoot = sanitizePath(workspaceRoot)
    const safeProvider = validateString(provider, 50)
    const safeModel = validateString(model, 200)
    const orchId = `orch_${Date.now()}`
    const orch = new OrchestratorAgent({ orchestratorId: orchId, task: safeTask, workspaceRoot: safeRoot, provider: safeProvider, model: safeModel, onEvent: () => {} })
    const plan = await orch.plan(safeTask)
    activeOrchestrators.set(orchId, orch)
    return plan
  })

  ipcMain.handle('orchestrator:execute', async (_event, { plan, workspaceRoot, provider, model }: {
    plan: { orchestratorId?: string; task?: string; subAgents?: unknown[] }
    workspaceRoot: string; provider: string; model: string
  }) => {
    if (!plan?.task || !plan?.subAgents) throw new Error('Invalid plan: missing task or subAgents')
    const orchId = plan.orchestratorId || `orch_${Date.now()}`
    const existing = activeOrchestrators.get(orchId)
    const orch = existing || new OrchestratorAgent({ orchestratorId: orchId, task: plan.task, workspaceRoot, provider, model, onEvent: (e) => safeSend('orchestrator:event', e) })
    if (!existing) activeOrchestrators.set(orchId, orch)
    ;(async () => {
      try { await orch.execute(plan); safeSend('orchestrator:done', { orchestratorId: orchId }) }
      catch (err: any) { safeSend('orchestrator:error', { orchestratorId: orchId, error: err.message }) }
    })()
    return { orchestratorId: orchId }
  })

  ipcMain.handle('orchestrator:status', () => {
    const entries = Array.from(activeOrchestrators.entries()).map(([id]) => ({ orchestratorId: id, status: 'active' }))
    return { active: entries.length > 0, orchestrators: entries }
  })

  ipcMain.handle('orchestrator:cancel', async (_event, orchestratorId: string) => {
    activeOrchestrators.delete(orchestratorId)
    safeSend('orchestrator:cancelled', { orchestratorId })
    return { ok: true }
  })
}
