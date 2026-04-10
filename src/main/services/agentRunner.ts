import type { AgentEvent, ChatMessage } from '../providers/types.js'
import { BUILT_IN_TOOLS, executeTool } from './agentTools.js'
import { getApiKey } from './storage.js'

export interface AgentRunnerOptions {
  agentId: string; task: string; workspaceRoot: string; provider: string; model: string
  onEvent: (event: AgentEvent) => void
}

const approvalResolvers = new Map<string, (approved: boolean) => void>()
export function approveAgent(agentId: string, approved: boolean) { const r = approvalResolvers.get(agentId); if (r) r(approved) }

function waitForApproval(agentId: string): Promise<boolean> {
  return new Promise((resolve) => approvalResolvers.set(agentId, resolve))
}

function buildPrompt(ws: string): string {
  const t = BUILT_IN_TOOLS.map(x => `- ${x.name}(${JSON.stringify(x.parameters)}): ${x.description}${x.requiresApproval?' [NEEDS APPROVAL]':''}`).join('\n')
  return `You are a coding agent. Workspace: ${ws}\nTools: ${t}\nCall tools with: <tool>{"tool":"name","args":{}}</tool>\nAfter ALL tool calls, respond with a brief summary.`
}

export async function runAgentLoop({ agentId, task, workspaceRoot, provider, model, onEvent }: AgentRunnerOptions): Promise<void> {
  const apiKey = getApiKey(provider)
  if (!apiKey) { onEvent({ agentId, step: 0, type: 'error', error: `No API key for ${provider}` }); return }

  const messages: ChatMessage[] = [
    { role: 'system', content: buildPrompt(workspaceRoot), timestamp: Date.now() },
    { role: 'user', content: task, timestamp: Date.now() },
  ]

  for (let turn = 1; turn <= 10; turn++) {
    onEvent({ agentId, step: turn, type: 'thinking' })
    try {
      const res = await callProvider(provider, model, messages, apiKey)
      onEvent({ agentId, step: turn, type: 'done', finalResponse: res })
      break
    } catch (err: any) {
      if (err.message?.includes('<tool>')) {
        const toolCall = parseToolCall(err.message)
        onEvent({ agentId, step: turn, type: 'tool_call', toolCall })
        let approved = !toolCall.requiresApproval
        if (toolCall.requiresApproval) {
          onEvent({ agentId, step: turn, type: 'approval_needed', toolCall })
          approved = await waitForApproval(agentId)
        }
        const result = approved ? await executeTool(toolCall, workspaceRoot) : { output: '[rejected]', approved: false }
        onEvent({ agentId, step: turn, type: 'tool_result', toolCall, result: { ...result, toolName: toolCall.toolName, approved } })
        messages.push({ role: 'assistant', content: JSON.stringify(toolCall), timestamp: Date.now() })
        messages.push({ role: 'user', content: `Tool: ${toolCall.toolName}\nResult: ${result.output}${result.error ? '\nError: '+result.error : ''}`, timestamp: Date.now() })
      } else {
        onEvent({ agentId, step: turn, type: 'error', error: err.message })
        break
      }
    }
  }
}

async function callProvider(provider: string, model: string, messages: ChatMessage[], apiKey: string): Promise<string> {
  if (provider === 'anthropic' || provider === 'openai' || provider === 'openrouter' || provider === 'qwen') {
    const { default: OpenAI } = await import('openai')
    const client = new OpenAI({ apiKey, baseURL: provider === 'qwen' ? 'https://dashscope.aliyuncs.com/compatible-mode/v1' : provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined })
    const resp = await client.chat.completions.create({ model, messages: messages.map(m => ({ role: m.role as any, content: typeof m.content === 'string' ? m.content : '' })), max_tokens: 4096 })
    const content = resp.choices[0]?.message?.content || ''
    const toolMatch = content.match(/<tool>(.*?)<\/tool>/s)
    if (toolMatch) throw new Error(toolMatch[1])
    return content
  }
  throw new Error(`Provider ${provider} not supported for agent mode`)
}

function parseToolCall(json: string): { toolName: string; args: Record<string, unknown>; requiresApproval: boolean } {
  const parsed = JSON.parse(json)
  const tool = BUILT_IN_TOOLS.find(t => t.name === parsed.tool)
  return { toolName: parsed.tool, args: parsed.args || {}, requiresApproval: tool?.requiresApproval ?? true }
}
