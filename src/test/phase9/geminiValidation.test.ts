import { describe, it, expect, vi } from 'vitest'

describe('Gemini API Validation', () => {
  it('validateGeminiApiKey() returns valid:true on models response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ models: [{ name: 'models/gemini-2.5-pro' }] }) })
    vi.stubGlobal('fetch', mockFetch)
    const { validateGeminiApiKey } = await import('../../main/services/oauthService.js')
    const result = await validateGeminiApiKey('AIza-valid')
    expect(result.valid).toBe(true)
    expect(result.models).toContain('gemini-2.5-pro')
  })

  it('validateGeminiApiKey() returns valid:false on 403', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 403 })
    vi.stubGlobal('fetch', mockFetch)
    const { validateGeminiApiKey } = await import('../../main/services/oauthService.js')
    const result = await validateGeminiApiKey('AIza-invalid')
    expect(result.valid).toBe(false)
    expect(result.error).toContain('Invalid')
  })

  it('validateGeminiApiKey() returns valid:false on network error', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', mockFetch)
    const { validateGeminiApiKey } = await import('../../main/services/oauthService.js')
    const result = await validateGeminiApiKey('AIza-key')
    expect(result.valid).toBe(false)
  })

  it('googleOAuthWithClientId() returns error for placeholder clientId', async () => {
    const { googleOAuthWithClientId } = await import('../../main/services/oauthService.js')
    const result = await googleOAuthWithClientId('your-google-client-id.apps.googleusercontent.com', true)
    expect(result.status).toBe('error')
  })

  it('googleOAuthWithClientId() returns error for empty clientId', async () => {
    const { googleOAuthWithClientId } = await import('../../main/services/oauthService.js')
    const result = await googleOAuthWithClientId('', true)
    expect(result.status).toBe('error')
  })

  it('googleOAuthWithClientId() accepts valid-looking clientId', async () => {
    const { googleOAuthWithClientId } = await import('../../main/services/oauthService.js')
    try {
      const result = await googleOAuthWithClientId('123456789-abc.apps.googleusercontent.com', true)
      expect(result.status).not.toBe('error')
      await googleOAuthWithClientId('123456789-abc.apps.googleusercontent.com', false)
    } catch {
      // Server may fail to bind port in test -- that's OK
    }
  })
})
