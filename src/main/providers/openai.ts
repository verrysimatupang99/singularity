import { ModelInfo } from './types.js'
import { OpenAICompatibleProvider } from './openai-compatible.js'

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor() {
    super('openai', 'OpenAI', 'https://api.openai.com/v1')
  }

  private static readonly MODELS: ModelInfo[] = [
    {
      id: 'gpt-4.1',
      name: 'GPT-4.1',
      contextWindow: 1_047_576,
      maxOutputTokens: 32_768,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: true,
    },
    {
      id: 'gpt-4.1-mini',
      name: 'GPT-4.1 Mini',
      contextWindow: 1_047_576,
      maxOutputTokens: 32_768,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
    {
      id: 'gpt-4.1-nano',
      name: 'GPT-4.1 Nano',
      contextWindow: 1_047_576,
      maxOutputTokens: 32_768,
      supportsTools: true,
      supportsVision: false,
      supportsReasoning: false,
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
    {
      id: 'o3',
      name: 'o3',
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: true,
    },
    {
      id: 'o4-mini',
      name: 'o4 Mini',
      contextWindow: 200_000,
      maxOutputTokens: 100_000,
      supportsTools: true,
      supportsVision: false,
      supportsReasoning: true,
    },
  ]

  async getModels(): Promise<ModelInfo[]> {
    return OpenAIProvider.MODELS
  }
}
