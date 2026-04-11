import {
  AIProvider,
  AuthMethod,
  ModelInfo,
  ChatMessage,
  ChatOptions,
  StreamChunk,
  ChatResponse,
  AuthError,
  NetworkError,
  ProviderError,
  CancelledError,
} from './types.js'
import { getApiKey } from '../services/storage.js'

/**
 * Base class for OpenAI-compatible providers.
 * Extended by OpenAIProvider and OpenRouterProvider.
 */
export abstract class OpenAICompatibleProvider implements AIProvider {
  readonly authMethods: AuthMethod[] = [
    { type: 'api-key', label: 'API Key', description: 'Enter your API key' },
  ]

  private abortControllers = new Map<string, AbortController>()

  constructor(
    readonly id: string,
    readonly name: string,
    protected baseUrl: string,
    protected extraHeaders: Record<string, string> = {},
  ) {}

  abstract getModels(): Promise<ModelInfo[]>

  async isAvailable(): Promise<boolean> {
    const apiKey = getApiKey(this.id)
    return !!apiKey
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ChatResponse> {
    const apiKey = getApiKey(this.id)
    if (!apiKey) {
      throw new AuthError(`${this.name} API key not configured. Add your key in Settings.`)
    }

    const controller = new AbortController()
    const requestId = `${this.id}_${Date.now()}`
    this.abortControllers.set(requestId, controller)

    const body: Record<string, unknown> = {
      model: options.model,
      messages: this.formatMessages(messages),
      stream: true,
      max_tokens: options.maxTokens ?? 4096,
    }

    // Add reasoning_effort for o3/o4-mini models
    if (options.reasoningEffort && (options.model.startsWith('o3') || options.model.startsWith('o4'))) {
      body.reasoning_effort = options.reasoningEffort
    }

    if (options.temperature !== undefined) {
      body.temperature = options.temperature
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools
    }

    try {
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...this.extraHeaders,
      }

      const response = await this.fetchWithRetry(
        `${this.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      )

      if (!response.ok) {
        throw await this.handleHttpError(response)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new NetworkError('No response body')
      }

      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''
      const toolCalls: StreamChunk['toolCall'][] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (controller.signal.aborted) {
          throw new CancelledError()
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const dataStr = trimmed.slice(6)
          if (dataStr === '[DONE]') {
            break
          }

          try {
            const data = JSON.parse(dataStr) as Record<string, unknown>
            const choice = ((data.choices as unknown[])?.[0] as Record<string, unknown>) || {}
            const delta = (choice.delta as Record<string, unknown>) || {}

            // Text content
            if (typeof delta.content === 'string' && delta.content) {
              fullContent += delta.content
              onChunk({ type: 'text', content: delta.content })
            }

            // Reasoning / thinking content (o3/o4-mini)
            if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
              onChunk({ type: 'thought', content: delta.reasoning_content })
            }

            // Tool calls
            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
                const toolCall: StreamChunk['toolCall'] = {
                  id: (tc.id as string) || '',
                  name: (tc.function?.name as string) || 'unknown',
                  input: {},
                }
                if (typeof tc.function?.arguments === 'string') {
                  try {
                    toolCall.input = JSON.parse(tc.function.arguments)
                  } catch {
                    toolCall.input = { raw: tc.function.arguments }
                  }
                }
                toolCalls.push(toolCall)
                onChunk({ type: 'tool_call', content: '', toolCall })
              }
            }
          } catch {
            // Skip unparseable SSE lines
          }
        }
      }

      return {
        id: requestId,
        content: fullContent,
        model: options.model,
        stopReason: 'end_turn',
      }
    } catch (err) {
      if (err instanceof CancelledError || controller.signal.aborted) {
        throw new CancelledError()
      }
      throw err
    } finally {
      this.abortControllers.delete(requestId)
    }
  }

  cancel(requestId: string): void {
    const controller = this.abortControllers.get(requestId)
    if (controller) {
      controller.abort()
      this.abortControllers.delete(requestId)
    }
  }

  // -----------------------------------------------------------------------
  // Subclass hooks
  // -----------------------------------------------------------------------

  /** Subclasses can override for custom error handling */
  protected async handleHttpError(response: Response): Promise<Error> {
    const status = response.status

    if (status === 401) {
      return new AuthError(`Invalid ${this.name} API key. Check your key in Settings.`)
    }

    if (status === 403) {
      return new AuthError(`${this.name} access forbidden. Check your API key permissions.`)
    }

    // 429/500/503 are now retried by fetchWithRetry, so if we get here
    // after all retries exhausted, provide a clear error message
    if (status === 429) {
      return new ProviderError(`${this.name} rate limit exceeded. Please wait and try again.`)
    }

    if (status === 500 || status === 503) {
      return new ProviderError(`${this.name} server error (${status}). The provider may be temporarily unavailable.`)
    }

    let message = `${this.name} API error (${status})`
    try {
      const body = await response.json() as Record<string, unknown>
      const err = body.error as Record<string, unknown> | undefined
      if (err?.message) message += `: ${err.message}`
    } catch { /* Use default message */ }
    return new ProviderError(message)
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private formatMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
    return messages.map((m) => ({
      role: m.role === 'system' ? 'system' : m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : '',
    }))
  }

  /**
   * Retryable fetch with exponential backoff.
   * Retries on both network errors AND HTTP 429/500/503.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    retries = 0,
  ): Promise<Response> {
    try {
      const response = await fetch(url, init)

      // Check if we should retry (rate limit or server error)
      if ((response.status === 429 || response.status === 500 || response.status === 503) && retries < OpenAICompatibleProvider.MAX_RETRIES) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '0', 10)
        const delay = retryAfter > 0
          ? Math.min(retryAfter * 1000, 30000)
          : Math.pow(2, retries) * 1000

        // Consume the body before retrying
        try { await response.body?.cancel() } catch {}

        await new Promise((resolve) => setTimeout(resolve, delay))
        return this.fetchWithRetry(url, init, retries + 1)
      }

      return response
    } catch (err) {
      if (retries >= OpenAICompatibleProvider.MAX_RETRIES) {
        throw new NetworkError(`Network error after ${retries} retries: ${err instanceof Error ? err.message : String(err)}`)
      }
      const delay = Math.pow(2, retries) * 1000
      await new Promise((resolve) => setTimeout(resolve, delay))
      return this.fetchWithRetry(url, init, retries + 1)
    }
  }

  private static readonly MAX_RETRIES = 3
}
