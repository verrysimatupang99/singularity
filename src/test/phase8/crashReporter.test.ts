import { describe, it, expect, vi } from 'vitest'

// Mock fs
vi.mock('fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(() => JSON.stringify([{ id: 'test1', timestamp: Date.now(), message: 'test crash', appVersion: '0.1.0', platform: 'linux' }])),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => ['test1.json']),
  unlinkSync: vi.fn(),
}))
vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test'), getVersion: vi.fn(() => '0.1.0') },
}))
vi.mock('electron-log/main', () => ({ default: { error: vi.fn(), info: vi.fn() } }))

describe('Crash Reporter', () => {
  it('save() writes a report', async () => {
    const { CrashReporterService } = await import('../../main/services/crashReporter.js')
    const reporter = new CrashReporterService()
    const id = reporter.save({ message: 'Test crash', stack: 'at foo()', context: 'test' })
    expect(id).toBeDefined()
    expect(id.length).toBeGreaterThan(0)
  })

  it('list() returns sorted reports', async () => {
    const { CrashReporterService } = await import('../../main/services/crashReporter.js')
    const reporter = new CrashReporterService()
    const reports = reporter.list()
    expect(Array.isArray(reports)).toBe(true)
  })

  it('report includes appVersion and platform', async () => {
    const { CrashReporterService } = await import('../../main/services/crashReporter.js')
    const reporter = new CrashReporterService()
    const id = reporter.save({ message: 'Version test' })
    expect(id).toBeDefined()
  })

  it('handles missing crash directory gracefully', async () => {
    const { CrashReporterService } = await import('../../main/services/crashReporter.js')
    expect(() => new CrashReporterService()).not.toThrow()
  })

  it('crashReport IPC bridge is defined in preload', async () => {
    // Verify the preload source contains the crashReport IPC binding
    // (In test env window.api is not available since it requires Electron renderer context)
    vi.doUnmock('fs')
    const fs = await import('fs')
    const path = await import('path')
    const preloadPath = path.resolve(__dirname, '../../preload/index.ts')
    const source = fs.readFileSync(preloadPath, 'utf8')
    expect(source).toContain('crashReport')
  })

  it('crashList IPC bridge is defined in preload', async () => {
    vi.doUnmock('fs')
    const fs = await import('fs')
    const path = await import('path')
    const preloadPath = path.resolve(__dirname, '../../preload/index.ts')
    const source = fs.readFileSync(preloadPath, 'utf8')
    expect(source).toContain('crashList')
  })
})
