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

export class AnthropicProvider implements AIProvider {
  readonly id = 'anthropic'
  readonly name = 'Anthropic Claude'
  readonly authMethods: AuthMethod[] = [
    { type: 'api-key', label: 'API Key', description: 'Enter your Anthropic API key' },
  ]

  private static readonly BASE_URL = 'https://api.anthropic.com/v1'
  private static readonly API_VERSION = '2023-06-01'
  private static readonly MAX_RETRIES = 3

  private abortControllers = new Map<string, AbortController>()

  private static readonly MODELS: ModelInfo[] = [
    {
      id: 'claude-opus-4-5-20260318',
      name: 'Claude Opus 4.5',
      contextWindow: 200_000,
      maxOutputTokens: 32_768,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: true,
    },
    {
      id: 'claude-sonnet-4-5-20260318',
      name: 'Claude Sonnet 4.5',
      contextWindow: 200_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
    {
      id: 'claude-haiku-3-5-20260318',
      name: 'Claude Haiku 3.5',
      contextWindow: 200_000,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
  ]

  async isAvailable(): Promise<boolean> {
    const apiKey = getApiKey('anthropic')
    if (!apiKey) return false
    return true
  }

  async getModels(): Promise<ModelInfo[]> {
    return AnthropicProvider.MODELS
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ChatResponse> {
    const apiKey = getApiKey('anthropic')
    if (!apiKey) {
      throw new AuthError('Anthropic API key not configured. Add your key in Settings.')
    }

    const controller = new AbortController()
    const requestId = `anthropic_${Date.now()}`
    this.abortControllers.set(requestId, controller)

    const systemMessage = messages.find((m) => m.role === 'system')
    const chatMessages = messages.filter((m) => m.role !== 'system')

    const body: Record<string, unknown> = {
      model: options.model,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
      messages: this.formatMessages(chatMessages),
    }

    if (systemMessage && typeof systemMessage.content === 'string') {
      body.system = systemMessage.content
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools
    }

    try {
      const response = await this.fetchWithRetry(
        `${AnthropicProvider.BASE_URL}/messages`,
        {
          method: 'POST',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': AnthropicProvider.API_VERSION,
            'anthropic-beta': 'interleaved-thinking-2025-05-14',
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      )

      if (!response.ok) {
        throw await this.handleHttpError(response)
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new NetworkError('No response body from Anthropic API')
      }

      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''
      const toolCalls: StreamChunk['toolCall'][] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Check cancellation
        if (controller.signal.aborted) {
          throw new CancelledError()
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          try {
            const data = JSON.parse(trimmed.slice(6))
            const chunk = this.parseSseEvent(data)
            if (chunk) {
              if (chunk.type === 'text') {
                fullContent += chunk.content
              } else if (chunk.type === 'tool_call' && chunk.toolCall) {
                toolCalls.push(chunk.toolCall)
              }
              onChunk(chunk)
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
  // Private helpers
  // -----------------------------------------------------------------------

  private formatMessages(messages: ChatMessage[]): Array<{ role: string; content: unknown }> {
    return messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: typeof m.content === 'string' ? m.content : m.content,
    }))
  }

  private parseSseEvent(data: Record<string, unknown>): StreamChunk | null {
    const type = data.type as string | undefined

    if (type === 'content_block_delta') {
      const delta = data.delta as Record<string, unknown> | undefined
      if (!delta) return null

      if (delta.type === 'text_delta' && typeof delta.text === 'string') {
        return { type: 'text', content: delta.text }
      }

      if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string') {
        return { type: 'thought', content: delta.thinking }
      }
    }

    if (type === 'content_block_start') {
      const block = data.content_block as Record<string, unknown> | undefined
      if (block?.type === 'tool_use') {
        return {
          type: 'tool_call',
          content: '',
          toolCall: {
            id: (block.id as string) || '',
            name: (block.name as string) || 'unknown',
            input: (block.input as Record<string, unknown>) || {},
          },
        }
      }
    }

    return null
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    retries = 0,
  ): Promise<Response> {
    try {
      return await fetch(url, init)
    } catch (err) {
      if (retries >= AnthropicProvider.MAX_RETRIES) {
        throw new NetworkError(`Network error after ${retries} retries: ${err instanceof Error ? err.message : String(err)}`)
      }
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, retries) * 1000
      await new Promise((resolve) => setTimeout(resolve, delay))
      return this.fetchWithRetry(url, init, retries + 1)
    }
  }

  private async handleHttpError(response: Response): Promise<Error> {
    const status = response.status

    if (status === 401) {
      return new AuthError('Invalid Anthropic API key. Check your key in Settings.')
    }

    if (status === 429) {
      // Retry with exponential backoff
      const retryAfter = parseInt(response.headers.get('retry-after') || '1', 10)
      const delay = Math.min(retryAfter * 1000, 4000)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return new ProviderError('Anthropic rate limited. Retrying...')
    }

    if (status === 500 || status === 503 || status === 529) {
      return new ProviderError('Anthropic service is overloaded. Please try again.')
    }

    let message = `Anthropic API error (${status})`
    try {
      const body = await response.json() as Record<string, unknown>
      if (body.error && typeof (body.error as Record<string, unknown>).message === 'string') {
        message += `: ${(body.error as Record<string, unknown>).message}`
      }
    } catch {
      // Use default message
    }
    return new ProviderError(message)
  }
}
