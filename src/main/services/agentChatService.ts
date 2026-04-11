/**
 * Agent Chat Service
 * Unified chat interface for agent mode (agentRunner + orchestrator).
 * Supports structured function calling for all providers.
 */

import type { AgentTool } from '../providers/types.js'
import { getApiKey } from './storage.js'

export interface AgentChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AgentToolCall {
  toolName: string
  args: Record<string, unknown>
}

export interface AgentChatResponse {
  content: string
  toolCalls: AgentToolCall[]
}

/**
 * Build OpenAI-compatible tool definitions from AgentTool[]
 */
function buildToolDefs(tools: AgentTool[]): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}> {
  return tools.map(t => ({
    type: 'function' as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }))
}

/**
 * Call any provider's chat API with tool support.
 * Returns structured response with content + tool calls.
 */
export async function agentChat(
  provider: string,
  model: string,
  messages: AgentChatMessage[],
  tools?: AgentTool[],
): Promise<AgentChatResponse> {
  const apiKey = getApiKey(provider)
  if (!apiKey) throw new Error(`No API key for ${provider}`)

  const toolDefs = tools ? buildToolDefs(tools) : undefined

  if (provider === 'gemini') {
    return callGemini(model, messages, toolDefs)
  }

  // All others are OpenAI-compatible
  const baseURL = provider === 'qwen'
    ? 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    : provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1'
      : provider === 'copilot'
        ? 'https://api.githubcopilot.com'
        : undefined

  return callOpenAICompatible(model, messages, toolDefs, apiKey, baseURL)
}

async function callOpenAICompatible(
  model: string,
  messages: AgentChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> | undefined,
  apiKey: string,
  baseURL: string | undefined,
): Promise<AgentChatResponse> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey, baseURL })

  const resp = await client.chat.completions.create({
    model,
    messages: messages.map(m => ({ role: m.role as any, content: m.content })),
    tools: tools as any,
    max_tokens: 4096,
  })

  const choice = resp.choices[0]?.message
  const content = choice?.content || ''

  // Parse tool calls from structured response
  const toolCalls: AgentToolCall[] = []
  if (choice?.tool_calls) {
    for (const tc of choice.tool_calls) {
      try {
        const args = JSON.parse(tc.function?.arguments || '{}')
        toolCalls.push({ toolName: tc.function?.name || '', args })
      } catch { /* skip malformed */ }
    }
  }

  return { content, toolCalls }
}

async function callGemini(
  model: string,
  messages: AgentChatMessage[],
  tools: Array<{ type: 'function'; function: { name: string; description: string; parameters: Record<string, unknown> } }> | undefined,
): Promise<AgentChatResponse> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('No API key for gemini')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

  const systemMessage = messages.find(m => m.role === 'system')
  const body: Record<string, unknown> = { contents }
  if (systemMessage) {
    body.systemInstruction = { parts: [{ text: systemMessage.content }] }
  }

  // Gemini function calling
  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({
      functionDeclarations: [{
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      }],
    }))
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini API error: ${err}`)
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> }
    }>
  }

  const candidate = data.candidates?.[0]
  const parts = candidate?.content?.parts || []

  let content = ''
  const toolCalls: AgentToolCall[] = []

  for (const part of parts) {
    if (part.text) content += part.text
    if (part.functionCall) {
      toolCalls.push({ toolName: part.functionCall.name, args: part.functionCall.args })
    }
  }

  return { content, toolCalls }
}
