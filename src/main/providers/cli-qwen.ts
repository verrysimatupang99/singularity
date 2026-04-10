import { CliSessionManager } from '../services/cliSessionManager.js'
import { createCliProvider, CliProviderConfig } from './cli-provider-factory.js'

const config: CliProviderConfig = {
  id: 'qwen-cli',
  name: 'Qwen CLI',
  binaryNames: ['qwen', 'qwen-code'],
  models: [
    {
      id: 'qwen-max',
      name: 'Qwen Max (CLI)',
      contextWindow: 131072,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: true,
      supportsReasoning: true,
    },
  ],
  description: 'Uses installed Qwen CLI credentials',
}

export const qwenCliManager = new CliSessionManager()
export const QwenCLIProvider = createCliProvider(config, qwenCliManager)
