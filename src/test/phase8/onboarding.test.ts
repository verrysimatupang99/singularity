import { describe, it, expect, vi } from 'vitest'

let storedSettings: Record<string, any> = {}

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => JSON.stringify(storedSettings)),
  writeFileSync: vi.fn((_path: string, content: string) => {
    try { storedSettings = JSON.parse(content) } catch { /* ignore */ }
  }),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test') },
  safeStorage: { isEncryptionAvailable: vi.fn(() => true), encryptString: vi.fn(() => Buffer.from('')), decryptString: vi.fn(() => '') },
}))
vi.mock('os', () => ({ default: { hostname: vi.fn(() => 'test'), userInfo: vi.fn(() => ({ username: 'test' })) }, hostname: vi.fn(() => 'test'), userInfo: vi.fn(() => ({ username: 'test' })) }))
vi.mock('path', () => ({ join: vi.fn((...a: string[]) => a.join('/')), dirname: vi.fn((p: string) => p) }))

describe('Onboarding', () => {
  it('isFirstRun() returns true when no settings', async () => {
    const { isFirstRun } = await import('../../main/services/storage.js')
    expect(isFirstRun()).toBe(true)
  })

  it('markOnboardingComplete() sets the flag', async () => {
    const { markOnboardingComplete, isFirstRun } = await import('../../main/services/storage.js')
    markOnboardingComplete()
    // After marking, isFirstRun should return false
    expect(isFirstRun()).toBe(false)
  })
})
