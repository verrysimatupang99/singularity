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
import { readFileSync } from 'fs'
import { homedir } from 'os'

// ---------------------------------------------------------------------------
// Gemini credential format (imported from ~/.gemini/oauth_creds.json)
// ---------------------------------------------------------------------------

interface GeminiOAuthCredentials {
  access_token: string
  refresh_token: string
  client_id: string
  client_secret: string
  expiry_date: number
}

// ---------------------------------------------------------------------------
// Gemini API request/response shapes
// ---------------------------------------------------------------------------

interface GeminiContent {
  role: 'user' | 'model'
  parts: Array<{ text?: string; thought?: boolean; functionCall?: { name: string; args: Record<string, unknown> } }>
}

interface GeminiRequestBody {
  contents: GeminiContent[]
  systemInstruction?: { parts: Array<{ text: string }> }
  generationConfig?: Record<string, unknown>
  tools?: unknown[]
}

// ---------------------------------------------------------------------------
// GeminiProvider — unified AI provider for Google Gemini
// ---------------------------------------------------------------------------

export class GeminiProvider implements AIProvider {
  readonly id = 'gemini'
  readonly name = 'Google Gemini'
  readonly authMethods: AuthMethod[] = [
    { type: 'api-key', label: 'API Key', description: 'Enter your Google AI API key' },
    { type: 'oauth-import', label: 'OAuth Import', description: 'Import OAuth credentials from ~/.gemini/oauth_creds.json' },
  ]

  private static readonly BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
  private static readonly OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token'
  private static readonly MAX_RETRIES = 3
  private static readonly CREDENTIALS_PATH = '.gemini/oauth_creds.json'

  private abortControllers = new Map<string, AbortController>()

  private static readonly MODELS: ModelInfo[] = [
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro',
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: true,
    },
    {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      contextWindow: 1_048_576,
      maxOutputTokens: 65_536,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
    {
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      contextWindow: 1_048_576,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
  ]

  async isAvailable(): Promise<boolean> {
    const apiKey = getApiKey('gemini')
    if (apiKey) return true

    // Check for imported OAuth credentials
    try {
      const creds = this.readCredentials()
      return creds !== null
    } catch {
      return false
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    return GeminiProvider.MODELS
  }

  async chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ChatResponse> {
    // Resolve auth — try API key first, then OAuth credentials
    const auth = await this.resolveAuth()

    const controller = new AbortController()
    const requestId = `gemini_${Date.now()}`
    this.abortControllers.set(requestId, controller)

    // If caller provided an AbortSignal, link it
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true })
    }

    // Build Gemini request body
    const systemMessage = messages.find((m) => m.role === 'system')
    const chatMessages = messages.filter((m) => m.role !== 'system')

    const body: GeminiRequestBody = {
      contents: this.formatMessages(chatMessages),
    }

    if (systemMessage && typeof systemMessage.content === 'string') {
      body.systemInstruction = { parts: [{ text: systemMessage.content }] }
    }

    body.generationConfig = {
      maxOutputTokens: options.maxTokens ?? 8192,
      temperature: options.temperature ?? 1.0,
      topP: options.topP ?? 0.95,
    }

    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools
    }

    // Build URL and headers based on auth method
    let url: string
    let headers: Record<string, string>

    if (auth.type === 'api-key') {
      url = `${GeminiProvider.BASE_URL}/${options.model}:streamGenerateContent?key=${auth.key}`
      headers = { 'Content-Type': 'application/json' }
    } else {
      url = `${GeminiProvider.BASE_URL}/${options.model}:streamGenerateContent`
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.token}`,
      }
    }

    try {
      const response = await this.fetchWithRetry(
        url,
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
        throw new NetworkError('No response body from Gemini API')
      }

      const decoder = new TextDecoder()
      let fullContent = ''
      let buffer = ''
      let usage: { inputTokens: number; outputTokens: number } | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        if (controller.signal.aborted) {
          throw new CancelledError()
        }

        buffer += decoder.decode(value, { stream: true })

        // Gemini uses newline-delimited JSON (not SSE)
        // Each line is a standalone JSON object, possibly preceded by comma or array brackets
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const rawLine of lines) {
          // Strip array wrapper characters: Gemini wraps the stream in [ ... ]
          const line = rawLine.trim().replace(/^[,\[\]]+/, '').replace(/[,\[\]]+$/, '').trim()
          if (!line) continue

          try {
            const data = JSON.parse(line) as Record<string, unknown>
            const chunk = this.parseStreamChunk(data)
            if (chunk) {
              if (chunk.type === 'text') {
                fullContent += chunk.content
              }
              onChunk(chunk)
            }

            // Extract usage metadata if present
            if (data.usageMetadata && typeof data.usageMetadata === 'object') {
              const meta = data.usageMetadata as Record<string, number>
              usage = {
                inputTokens: meta.promptTokenCount ?? 0,
                outputTokens: meta.candidatesTokenCount ?? 0,
              }
            }
          } catch {
            // Skip unparseable lines (array brackets, empty lines, etc.)
          }
        }
      }

      return {
        id: requestId,
        content: fullContent,
        model: options.model,
        usage,
        stopReason: 'stop',
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

  /**
   * Resolve auth: try API key first (Path A), then OAuth credentials import (Path B).
   */
  private async resolveAuth(): Promise<{ type: 'api-key'; key: string } | { type: 'oauth'; token: string }> {
    const apiKey = getApiKey('gemini')
    if (apiKey) {
      return { type: 'api-key', key: apiKey }
    }

    // Path B: OAuth credential import
    const creds = this.readCredentials()
    if (creds) {
      const token = await this.ensureValidToken(creds)
      return { type: 'oauth', token }
    }

    throw new AuthError('No Gemini API key or OAuth credentials found. Configure authentication in Settings.')
  }

  /**
   * Read OAuth credentials from ~/.gemini/oauth_creds.json
   */
  private readCredentials(): GeminiOAuthCredentials | null {
    try {
      const credsPath = this.getCredentialsPath()
      const raw = readFileSync(credsPath, 'utf8')
      const data = JSON.parse(raw) as Record<string, unknown>
      if (
        typeof data.access_token === 'string' &&
        typeof data.refresh_token === 'string' &&
        typeof data.client_id === 'string' &&
        typeof data.client_secret === 'string' &&
        typeof data.expiry_date === 'number'
      ) {
        return data as GeminiOAuthCredentials
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Get the absolute path to the OAuth credentials file.
   */
  private getCredentialsPath(): string {
    return homedir() + '/' + GeminiProvider.CREDENTIALS_PATH
  }

  /**
   * Ensure the access token is valid; refresh if expired.
   */
  private async ensureValidToken(creds: GeminiOAuthCredentials): Promise<string> {
    if (creds.expiry_date > Date.now()) {
      return creds.access_token
    }

    // Token expired — refresh
    const params = new URLSearchParams({
      client_id: creds.client_id,
      client_secret: creds.client_secret,
      refresh_token: creds.refresh_token,
      grant_type: 'refresh_token',
    })

    try {
      const response = await fetch(GeminiProvider.OAUTH_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })

      if (!response.ok) {
        throw new AuthError(`Failed to refresh OAuth token: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as Record<string, unknown>
      const newToken = data.access_token as string | undefined
      if (!newToken) {
        throw new AuthError('OAuth token refresh response missing access_token')
      }
      return newToken
    } catch (err) {
      if (err instanceof AuthError) throw err
      throw new NetworkError(`Failed to refresh OAuth token: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /**
   * Convert ChatMessage[] to Gemini content format.
   * Filter out system messages, convert 'assistant' -> 'model'.
   */
  private formatMessages(messages: ChatMessage[]): GeminiContent[] {
    return messages.map((m) => {
      const role = m.role === 'assistant' ? 'model' : 'user'
      const parts: GeminiContent['parts'] = []

      if (typeof m.content === 'string') {
        parts.push({ text: m.content })
      } else {
        for (const block of m.content) {
          if (block.type === 'text' && block.text) {
            parts.push({ text: block.text })
          }
          // Image blocks, tool_use, tool_result can be extended here
        }
      }

      return { role, parts }
    })
  }

  /**
   * Parse a single JSON line from the Gemini streaming response.
   */
  private parseStreamChunk(data: Record<string, unknown>): StreamChunk | null {
    const candidates = data.candidates as Array<Record<string, unknown>> | undefined
    if (!candidates || candidates.length === 0) return null

    const candidate = candidates[0]
    const content = candidate.content as Record<string, unknown> | undefined
    if (!content) return null

    const parts = content.parts as Array<Record<string, unknown>> | undefined
    if (!parts || parts.length === 0) return null

    const allChunks: StreamChunk[] = []

    for (const part of parts) {
      // functionCall → tool_call
      if (part.functionCall && typeof part.functionCall === 'object') {
        const fc = part.functionCall as { name: string; args: Record<string, unknown> }
        allChunks.push({
          type: 'tool_call',
          content: '',
          toolCall: {
            id: '',
            name: fc.name ?? 'unknown',
            input: fc.args ?? {},
          },
        })
        continue
      }

      // text field
      if (typeof part.text === 'string') {
        // Check if it's a reasoning/thought chunk
        if (part.thought === true || part.type === 'thought') {
          allChunks.push({ type: 'thought', content: part.text })
        } else {
          allChunks.push({ type: 'text', content: part.text })
        }
      }
    }

    // Return the first chunk; subsequent chunks will come from future lines
    return allChunks.length > 0 ? allChunks[0] : null
  }

  /**
   * Fetch with exponential backoff retry for 429 errors.
   * Other errors are not retried here — they are handled after the response.
   */
  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    retries = 0,
  ): Promise<Response> {
    try {
      return await fetch(url, init)
    } catch (err) {
      if (retries >= GeminiProvider.MAX_RETRIES) {
        throw new NetworkError(`Network error after ${retries} retries: ${err instanceof Error ? err.message : String(err)}`)
      }
      const delay = Math.pow(2, retries) * 1000
      await new Promise((resolve) => setTimeout(resolve, delay))
      return this.fetchWithRetry(url, init, retries + 1)
    }
  }

  /**
   * Map HTTP status codes to appropriate error types.
   */
  private async handleHttpError(response: Response): Promise<Error> {
    const status = response.status

    if (status === 401) {
      return new AuthError('Invalid Gemini API key or expired OAuth token. Check your authentication in Settings.')
    }

    if (status === 429) {
      // Rate limited — will be retried by fetchWithRetry
      const retryAfter = parseInt(response.headers.get('retry-after') || '1', 10)
      const delay = Math.min(retryAfter * 1000, 4000)
      await new Promise((resolve) => setTimeout(resolve, delay))
      return new ProviderError('Gemini rate limited. Retrying...')
    }

    if (status === 500 || status === 503) {
      return new ProviderError('Gemini service is unavailable. Please try again.')
    }

    let message = `Gemini API error (${status})`
    try {
      const body = await response.json() as Record<string, unknown>
      const error = body.error as Record<string, unknown> | undefined
      if (error && typeof error.message === 'string') {
        message += `: ${error.message}`
      }
    } catch {
      // Use default message
    }
    return new ProviderError(message)
  }
}
