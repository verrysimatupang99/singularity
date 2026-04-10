import { CliSessionManager } from '../services/cliSessionManager.js'
import { createCliProvider, CliProviderConfig } from './cli-provider-factory.js'

const config: CliProviderConfig = {
  id: 'claude-cli',
  name: 'Claude CLI',
  binaryNames: ['claude'],
  models: [
    {
      id: 'claude-opus-4',
      name: 'Claude Opus 4 (CLI)',
      contextWindow: 200000,
      maxOutputTokens: 32768,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: true,
    },
    {
      id: 'claude-sonnet-4',
      name: 'Claude Sonnet 4 (CLI)',
      contextWindow: 200000,
      maxOutputTokens: 32768,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: true,
    },
  ],
  description: 'Uses installed Claude CLI credentials',
}

export const claudeCliManager = new CliSessionManager()
export const ClaudeCLIProvider = createCliProvider(config, claudeCliManager)
