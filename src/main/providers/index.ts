import { registry } from './registry.js'
import { AnthropicProvider } from './anthropic.js'
import { OpenAIProvider } from './openai.js'
import { OpenRouterProvider } from './openrouter.js'
import { GeminiProvider } from './gemini.js'
import { GitHubCopilotProvider } from './github-copilot.js'
import { QwenProvider } from './qwen.js'
import { OllamaProvider } from './ollama.js'
import { GeminiCLIProvider } from './cli-gemini.js'
import { ClaudeCLIProvider } from './cli-claude.js'
import { QwenCLIProvider } from './cli-qwen.js'
import type { StorageService } from './types.js'

/**
 * Initialize all providers and register them.
 * Called once during app startup.
 * CLI providers are always registered; their isAvailable() returns false
 * when the corresponding binary is not found in PATH.
 */
export function initProviders(_storage: unknown): void {
  registry.register(new AnthropicProvider())
  registry.register(new OpenAIProvider())
  registry.register(new OpenRouterProvider())
  registry.register(new GeminiProvider())
  registry.register(new GitHubCopilotProvider())
  registry.register(new QwenProvider())
  registry.register(new OllamaProvider())

  // Register CLI providers (isAvailable() checks binary presence at call time)
  registry.register(GeminiCLIProvider)
  registry.register(ClaudeCLIProvider)
  registry.register(QwenCLIProvider)
}

export { registry }
