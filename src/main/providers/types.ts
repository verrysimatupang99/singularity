/**
 * AIProvider — unified interface for all AI providers.
 * Defined in ARCHITECTURE.md §3.4
 */

export interface AIProvider {
  readonly id: string
  readonly name: string
  readonly authMethods: AuthMethod[]
  isAvailable(): Promise<boolean>
  getModels(): Promise<ModelInfo[]>
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ChatResponse>
  cancel(requestId: string): void
}

export interface AuthMethod {
  type: 'oauth-import' | 'oauth-pkce' | 'device-flow' | 'api-key'
  label: string
  description: string
}

export interface ModelInfo {
  id: string
  name: string
  contextWindow: number
  maxOutputTokens: number
  supportsTools: boolean
  supportsVision: boolean
  supportsReasoning: boolean
  pricing?: { inputPerToken: number; outputPerToken: number }
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | ContentBlock[]
}

export interface ContentBlock {
  type: 'text' | 'image' | 'tool_use' | 'tool_result'
  text?: string
  image_url?: string
  tool_use_id?: string
}

export interface ChatOptions {
  model: string
  maxTokens?: number
  temperature?: number
  topP?: number
  tools?: unknown[]
  reasoningEffort?: 'low' | 'medium' | 'high'
  signal?: AbortSignal
}

export interface StreamChunk {
  type: 'text' | 'thought' | 'tool_call' | 'tool_result'
  content: string
  toolCall?: {
    id: string
    name: string
    input: Record<string, unknown>
  }
}

export interface ChatResponse {
  id: string
  content: string
  model: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
  stopReason?: string
}

// ---------------------------------------------------------------------------
// Custom error types
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NetworkError'
  }
}

export class ProviderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProviderError'
  }
}

export class CancelledError extends Error {
  constructor() {
    super('Request was cancelled')
    this.name = 'CancelledError'
  }
}

// ---------------------------------------------------------------------------
// Agent Tools (Phase 6)
// ---------------------------------------------------------------------------

export interface AgentTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  requiresApproval: boolean
}

export interface AgentToolCall {
  toolName: string
  args: Record<string, unknown>
  requiresApproval: boolean
}

export interface AgentToolResult {
  toolName: string
  output: string
  error?: string
  approved: boolean
}

export type AgentEventType = 'thinking' | 'tool_call' | 'approval_needed' | 'tool_result' | 'done' | 'error'

export interface AgentEvent {
  agentId: string
  step: number
  type: AgentEventType
  toolCall?: AgentToolCall
  result?: AgentToolResult
  finalResponse?: string
  error?: string
}
