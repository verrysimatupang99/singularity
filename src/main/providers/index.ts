import { registry } from './registry.js'
import { AnthropicProvider } from './anthropic.js'
import { OpenAIProvider } from './openai.js'
import { OpenRouterProvider } from './openrouter.js'
import type { StorageService } from './types.js'

/**
 * Initialize all providers and register them.
 * Called once during app startup.
 */
export function initProviders(_storage: unknown): void {
  registry.register(new AnthropicProvider())
  registry.register(new OpenAIProvider())
  registry.register(new OpenRouterProvider())
}

export { registry }
