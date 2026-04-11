import type { AgentEvent } from '../providers/types.js'
import { BUILT_IN_TOOLS, executeTool } from './agentTools.js'
import { getApiKey } from './storage.js'
import { getMcpManager } from './mcpManager.js'
import { agentChat, AgentChatMessage } from './agentChatService.js'

export interface AgentRunnerOptions {
  agentId: string; task: string; workspaceRoot: string; provider: string; model: string
  onEvent: (event: AgentEvent) => void
}

const approvalResolvers = new Map<string, (approved: boolean) => void>()
export function approveAgent(agentId: string, approved: boolean) { const r = approvalResolvers.get(agentId); if (r) r(approved) }

function waitForApproval(agentId: string): Promise<boolean> {
  return new Promise((resolve) => approvalResolvers.set(agentId, resolve))
}

/**
 * Build the system prompt with available tools + MCP tools + memory.
 */
function buildSystemPrompt(ws: string, memories: Array<{ key: string; value: string }> = []): string {
  const toolList = BUILT_IN_TOOLS.map(x =>
    `- **${x.name}**: ${x.description}${x.requiresApproval ? ' (requires approval)' : ''}`
  ).join('\n')

  // Inject running MCP tools
  let mcpSection = ''
  try {
    const mgr = getMcpManager()
    const runningServers = mgr.listServers().filter(s => s.status === 'running')
    if (runningServers.length > 0) {
      const mcpTools: string[] = []
      for (const server of runningServers) {
        for (const tool of server.tools || []) {
          mcpTools.push(`- **mcp_call**: Call "${tool.name}" on server "${server.name}": ${tool.description || 'MCP tool'}`)
        }
      }
      mcpSection = `\n\n### MCP Tools (${mcpTools.length} from ${runningServers.length} servers)\n${mcpTools.join('\n')}`
    }
  } catch { /* MCP not available */ }

  const memSection = memories.length > 0
    ? `\n\n### Relevant Memories from Previous Sessions\n${memories.map(m => `- **${m.key}**: ${m.value}`).join('\n')}`
    : ''

  return `You are a coding agent working in workspace: ${ws}
${memSection}${mcpSection}

## Available Tools
${toolList}

## Instructions
- Use tools when needed to complete the task
- After tool calls, respond with a brief summary of what happened
- Read files before editing to understand context
- Write clean, well-structured code
- When done, provide a clear summary of changes made`
}

/**
 * Run the agent loop: send messages, handle tool calls, repeat until done.
 */
export async function runAgentLoop({ agentId, task, workspaceRoot, provider, model, onEvent }: AgentRunnerOptions): Promise<void> {
  const apiKey = getApiKey(provider)
  if (!apiKey) { onEvent({ agentId, step: 0, type: 'error', error: `No API key for ${provider}` }); return }

  const { agentMemory } = await import('./agentMemory.js')
  const memories = agentMemory.recall(task)

  const messages: AgentChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(workspaceRoot, memories) },
    { role: 'user', content: task },
  ]

  for (let turn = 1; turn <= 10; turn++) {
    onEvent({ agentId, step: turn, type: 'thinking' })
    try {
      const { content, toolCalls } = await agentChat(provider, model, messages, BUILT_IN_TOOLS)

      if (toolCalls.length === 0) {
        // No tool calls — agent is done
        onEvent({ agentId, step: turn, type: 'done', finalResponse: content })
        break
      }

      // Execute tool calls sequentially
      for (const tc of toolCalls) {
        const tool = BUILT_IN_TOOLS.find(t => t.name === tc.toolName)
        const requiresApproval = tool?.requiresApproval ?? true

        onEvent({ agentId, step: turn, type: 'tool_call', toolCall: { toolName: tc.toolName, args: tc.args, requiresApproval } })

        let approved = !requiresApproval
        if (requiresApproval) {
          onEvent({ agentId, step: turn, type: 'approval_needed', toolCall: { toolName: tc.toolName, args: tc.args, requiresApproval } })
          approved = await waitForApproval(agentId)
        }

        const result = approved
          ? await executeTool({ toolName: tc.toolName, args: tc.args }, workspaceRoot)
          : { output: '[rejected]', approved: false }

        onEvent({ agentId, step: turn, type: 'tool_result', toolCall: { toolName: tc.toolName, args: tc.args, requiresApproval }, result: { ...result, toolName: tc.toolName, approved } })

        // Append tool result to conversation
        messages.push({ role: 'user', content: `Tool: ${tc.toolName}\nResult: ${result.output}${result.error ? '\nError: ' + result.error : ''}` })
      }

      // Continue loop for next turn
    } catch (err: unknown) {
      onEvent({ agentId, step: turn, type: 'error', error: err instanceof Error ? err.message : String(err) })
      break
    }
  }
}
