import { ModelInfo } from './types.js'
import { OpenAICompatibleProvider } from './openai-compatible.js'

export class OpenRouterProvider extends OpenAICompatibleProvider {
  constructor() {
    super('openrouter', 'OpenRouter', 'https://openrouter.ai/api/v1', {
      'HTTP-Referer': 'https://github.com/verrysimatupang99/singularity',
      'X-Title': 'Singularity IDE',
    })
  }

  private cachedModels: ModelInfo[] | null = null
  private cacheTimestamp = 0
  private static readonly CACHE_TTL = 60 * 60 * 1000 // 1 hour

  async getModels(): Promise<ModelInfo[]> {
    const now = Date.now()

    // Return cached models if still valid
    if (this.cachedModels && now - this.cacheTimestamp < OpenRouterProvider.CACHE_TTL) {
      return this.cachedModels
    }

    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'HTTP-Referer': 'https://github.com/verrysimatupang99/singularity',
          'X-Title': 'Singularity IDE',
        },
      })

      if (!response.ok) {
        console.warn('OpenRouter: failed to fetch models, using cached or default')
        return this.cachedModels ?? OpenRouterProvider.DEFAULT_MODELS
      }

      const data = await response.json() as { data: Array<Record<string, unknown>> }
      const models: ModelInfo[] = (data.data || []).map((m) => ({
        id: (m.id as string) || 'unknown',
        name: (m.name as string) || (m.id as string) || 'Unknown',
        contextWindow: (m.context_length as number) ?? 8192,
        maxOutputTokens: (m.max_completion_tokens as number) ?? 4096,
        supportsTools: (m.top_provider as Record<string, unknown>)?.is_modelfilter_available === true,
        supportsVision: Array.isArray(m.architecture) && (m.architecture as string[]).includes('vision'),
        supportsReasoning: false,
      }))

      this.cachedModels = models
      this.cacheTimestamp = now
      return models
    } catch (err) {
      console.warn('OpenRouter: network error fetching models, using cached or default:', err)
      return this.cachedModels ?? OpenRouterProvider.DEFAULT_MODELS
    }
  }

  private static readonly DEFAULT_MODELS: ModelInfo[] = [
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o (via OpenRouter)',
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
    {
      id: 'anthropic/claude-sonnet-4',
      name: 'Claude Sonnet 4 (via OpenRouter)',
      contextWindow: 200_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
    {
      id: 'google/gemini-2.0-flash',
      name: 'Gemini 2.0 Flash (via OpenRouter)',
      contextWindow: 1_048_576,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
  ]
}
