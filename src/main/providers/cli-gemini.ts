import { CliSessionManager } from '../services/cliSessionManager.js'
import { createCliProvider, CliProviderConfig } from './cli-provider-factory.js'

const config: CliProviderConfig = {
  id: 'gemini-cli',
  name: 'Gemini CLI',
  binaryNames: ['gemini', 'gemini-cli'],
  models: [
    {
      id: 'gemini-2.5-pro',
      name: 'Gemini 2.5 Pro (CLI)',
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: true,
    },
  ],
  description: 'Uses installed Gemini CLI credentials',
}

export const geminiCliManager = new CliSessionManager()
export const GeminiCLIProvider = createCliProvider(config, geminiCliManager)
