import { AIProvider } from './types.js'

/**
 * Singleton provider registry.
 * Providers register themselves here and are queried by id.
 */
export class ProviderRegistry {
  private providers = new Map<string, AIProvider>()

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider)
  }

  get(id: string): AIProvider | undefined {
    return this.providers.get(id)
  }

  list(): AIProvider[] {
    return Array.from(this.providers.values())
  }

  async getAvailable(): Promise<AIProvider[]> {
    const results = await Promise.allSettled(
      this.list().map(async (p) => ({ provider: p, available: await p.isAvailable() })),
    )
    return results
      .filter((r): r is PromiseFulfilledResult<{ provider: AIProvider; available: boolean }> => r.status === 'fulfilled')
      .filter((r) => r.value.available)
      .map((r) => r.value.provider)
  }
}

export const registry = new ProviderRegistry()
