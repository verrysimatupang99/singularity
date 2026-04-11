import {
  AIProvider,
  AuthMethod,
  ModelInfo,
  ChatMessage,
  ChatOptions,
  StreamChunk,
  ChatResponse,
  NetworkError,
  CancelledError,
} from './types.js'

const DEFAULT_BASE_URL = 'http://localhost:11434'

/**
 * Ollama provider — local LLM via Ollama.
 * Uses Ollama's OpenAI-compatible `/v1/chat/completions` endpoint.
 * Also supports native `/api/chat` for model discovery.
 */
export class OllamaProvider implements AIProvider {
  readonly id = 'ollama'
  readonly name = 'Ollama (Local LLM)'
  readonly authMethods: AuthMethod[] = [
    { type: 'api-key', label: 'Local', description: 'No authentication needed — runs locally' },
  ]

  private abortControllers = new Map<string, AbortController>()
  private cachedModels: ModelInfo[] | null = null
  private baseUrl: string = DEFAULT_BASE_URL

  constructor(baseUrl?: string) {
    if (baseUrl) this.baseUrl = baseUrl
  }

  setBaseUrl(url: string): void { this.baseUrl = url }
  getBaseUrl(): string { return this.baseUrl }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
      return response.ok
    } catch {
      return false
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    // Try to fetch models from Ollama API
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) })
      if (response.ok) {
        const data = await response.json() as { models?: Array<{ name: string; details?: { parameter_size?: string } }> }
        if (data.models && data.models.length > 0) {
          this.cachedModels = data.models.map(m => ({
            id: m.name,
            name: this.formatModelName(m.name),
            contextWindow: 8192, // Ollama default, can vary
            maxOutputTokens: 2048,
            supportsTools: true,
            supportsVision: false,
            supportsReasoning: false,
          }))
          return this.cachedModels
        }
      }
    } catch {
      // Fall through to defaults
    }

    // Return cached or default models
    if (this.cachedModels) return this.cachedModels

    // Default well-known Ollama models
    return [
      { id: 'llama3.2', name: 'Llama 3.2', contextWindow: 131072, maxOutputTokens: 4096, supportsTools: true, supportsVision: false, supportsReasoning: false },
      { id: 'llama3.1:8b', name: 'Llama 3.1 (8B)', contextWindow: 8192, maxOutputTokens: 2048, supportsTools: true, supportsVision: false, supportsReasoning: false },
      { id: 'qwen2.5-coder:7b', name: 'Qwen 2.5 Coder (7B)', contextWindow: 32768, maxOutputTokens: 4096, supportsTools: true, supportsVision: false, supportsReasoning: false },
      { id: 'deepseek-coder-v2:16b', name: 'DeepSeek Coder V2 (16B)', contextWindow: 16384, maxOutputTokens: 4096, supportsTools: true, supportsVision: false, supportsReasoning: false },
      { id: 'mistral:7b', name: 'Mistral (7B)', contextWindow: 32768, maxOutputTokens: 2048, supportsTools: true, supportsVision: false, supportsReasoning: false },
      { id: 'phi4:14b', name: 'Phi-4 (14B)', contextWindow: 16384, maxOutputTokens: 2048, supportsTools: true, supportsVision: false, supportsReasoning: false },
    ]
  }

  /**
   * Refresh model list (useful after pulling a new model).
   */
  async refreshModels(): Promise<ModelInfo[]> {
    this.cachedModels = null
    return this.getModels()
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ChatResponse> {
    const available = await this.isAvailable()
    if (!available) {
      throw new NetworkError('Ollama is not running. Start Ollama and try again. (ollama.com)')
    }

    const controller = new AbortController()
    const requestId = `ollama_${Date.now()}`
    this.abortControllers.set(requestId, controller)

    // Use Ollama's native /api/chat endpoint (better for tool calling)
    const body: Record<string, unknown> = {
      model: options.model,
      messages: messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : '',
      })),
      stream: true,
    }

    if (options.maxTokens) {
      body.options = { num_predict: options.maxTokens }
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools
    }

    if (options.temperature !== undefined) {
      (body.options as any).temperature = options.temperature
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new NetworkError(`Ollama error (${response.status}): ${errorText}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new NetworkError('No response body from Ollama')

      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (controller.signal.aborted) throw new CancelledError()

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const data = JSON.parse(line) as {
              message?: { content?: string }
              done?: boolean
            }
            const content = data.message?.content
            if (content) {
              fullContent += content
              onChunk({ type: 'text', content })
            }
          } catch {
            // Skip unparseable lines
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

  /**
   * Pull a model from Ollama registry.
   */
  async pullModel(model: string, onProgress?: (status: string) => void): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model, stream: true }),
    })

    if (!response.ok) {
      throw new NetworkError(`Failed to pull model ${model}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new NetworkError('No response body')

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const data = JSON.parse(line) as { status?: string; completed?: number; total?: number }
          if (data.status) onProgress?.(data.status)
        } catch { /* skip */ }
      }
    }
  }

  private formatModelName(name: string): string {
    // Make names more readable: "llama3.2:latest" → "Llama 3.2"
    return name
      .replace(/:latest$/, '')
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/[_-]/g, ' ')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  }
}

export const ollamaProvider = new OllamaProvider()
