import { describe, it, expect, vi } from 'vitest'

describe('Plugin Marketplace', () => {
  it('fetchRegistry() returns plugin list from mocked URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ plugins: [{ name: 'test-plugin', version: '1.0.0', displayName: 'Test', description: '', author: '', downloadUrl: '', sha256: '', tools: [], homepage: '' }] })
    })
    vi.stubGlobal('fetch', mockFetch)
    const { PluginLoader } = await import('../../main/services/pluginLoader.js')
    const loader = new PluginLoader()
    const plugins = await loader.fetchRegistry('https://example.com/registry.json')
    expect(plugins.length).toBe(1)
    expect(plugins[0].name).toBe('test-plugin')
  })

  it('fetchRegistry() throws on network failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)
    const { PluginLoader } = await import('../../main/services/pluginLoader.js')
    const loader = new PluginLoader()
    await expect(loader.fetchRegistry()).rejects.toThrow('Cannot fetch plugin registry')
  })

  it('installFromRegistry() validates SHA-256 mismatch', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(10) })
    vi.stubGlobal('fetch', mockFetch)
    const { PluginLoader } = await import('../../main/services/pluginLoader.js')
    const loader = new PluginLoader()
    const result = await loader.installFromRegistry({
      name: 'test', version: '1.0.0', displayName: 'Test', description: '', author: '',
      downloadUrl: 'https://example.com/test.zip', sha256: 'wrong_hash_abc123', tools: [], homepage: ''
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('SHA-256')
  })

  it('installFromRegistry() graceful fail on bad download', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal('fetch', mockFetch)
    const { PluginLoader } = await import('../../main/services/pluginLoader.js')
    const loader = new PluginLoader()
    const result = await loader.installFromRegistry({
      name: 'test', version: '1.0.0', displayName: 'Test', description: '', author: '',
      downloadUrl: 'https://example.com/not-found.zip', sha256: 'abc', tools: [], homepage: ''
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Download failed')
  })
})
