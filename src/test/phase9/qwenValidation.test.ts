import { describe, it, expect, vi } from 'vitest'

describe('Qwen API Validation', () => {
  it('validateQwenApiKey() returns valid:true on 200 response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ id: 'qwen-max' }] }) })
    vi.stubGlobal('fetch', mockFetch)
    const { validateQwenApiKey } = await import('../../main/services/oauthService.js')
    const result = await validateQwenApiKey('sk-valid-key')
    expect(result.valid).toBe(true)
    expect(result.models).toContain('qwen-max')
  })

  it('validateQwenApiKey() returns valid:false on 401', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    vi.stubGlobal('fetch', mockFetch)
    const { validateQwenApiKey } = await import('../../main/services/oauthService.js')
    const result = await validateQwenApiKey('sk-invalid')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid')
  })

  it('validateQwenApiKey() returns valid:false on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)
    const { validateQwenApiKey } = await import('../../main/services/oauthService.js')
    const result = await validateQwenApiKey('sk-key')
    expect(result.valid).toBe(false)
  })

  it('qwenDeviceAuth() returns informative error', async () => {
    const { qwenDeviceAuth } = await import('../../main/services/oauthService.js')
    const result = await qwenDeviceAuth()
    expect(result.status).toBe('error')
    expect((result as any).error).toContain('API key')
  })

  it('qwenPoll() returns informative error', async () => {
    const { qwenPoll } = await import('../../main/services/oauthService.js')
    const result = await qwenPoll()
    expect(result.status).toBe('error')
    expect((result as any).error).toContain('API key')
  })

  it('openQwenApiKeyPage() calls shell.openExternal', async () => {
    const mockOpen = vi.fn().mockResolvedValue(undefined)
    vi.doMock('electron', () => ({ shell: { openExternal: mockOpen } }))
    const { openQwenApiKeyPage } = await import('../../main/services/oauthService.js')
    await openQwenApiKeyPage()
    expect(mockOpen).toHaveBeenCalled()
  })
})
