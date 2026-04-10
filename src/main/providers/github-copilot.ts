import { OpenAICompatibleProvider } from './openai-compatible.js'
import { AuthMethod, ModelInfo } from './types.js'
// TODO: Replace with getOAuthToken when OAuth token storage is implemented
import { getApiKey } from '../services/storage.js'

export class GitHubCopilotProvider extends OpenAICompatibleProvider {
  readonly id = 'github-copilot'
  readonly name = 'GitHub Copilot'
  readonly authMethods: AuthMethod[] = [
    {
      type: 'device-flow',
      label: 'GitHub OAuth',
      description: 'Login with your GitHub account',
    },
  ]

  private static readonly COPILOT_MODELS: ModelInfo[] = [
    {
      id: 'gpt-4.1',
      name: 'GPT-4.1 (Copilot)',
      contextWindow: 1047576,
      maxOutputTokens: 32768,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4 (Copilot)',
      contextWindow: 200000,
      maxOutputTokens: 16000,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: false,
    },
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro (Copilot)',
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: true,
    },
    {
      id: 'o3',
      name: 'o3 (Copilot)',
      contextWindow: 200000,
      maxOutputTokens: 100000,
      supportsTools: true,
      supportsVision: false,
      supportsReasoning: true,
    },
  ]

  constructor() {
    super('github-copilot', 'GitHub Copilot', 'https://api.githubcopilot.com')
  }

  async isAvailable(): Promise<boolean> {
    const token = this.getStoredToken()
    return !!token
  }

  async getModels(): Promise<ModelInfo[]> {
    return GitHubCopilotProvider.COPILOT_MODELS
  }

  private getStoredToken(): string | null {
    // TODO: Replace with getOAuthToken when OAuth token storage is implemented
    return getApiKey('github-copilot')
  }
}
