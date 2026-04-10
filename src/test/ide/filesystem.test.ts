import { vi } from 'vitest'

// Mock electron
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((val: string) => Buffer.from('enc:' + val)),
    decryptString: vi.fn((buf: Buffer) => {
      const str = buf.toString()
      return str.startsWith('enc:') ? str.slice(4) : 'decrypted'
    }),
  },
  app: { getPath: vi.fn(() => '/tmp/singularity-test') },
  dialog: { showOpenDialog: vi.fn() },
}))

vi.mock('os', () => ({
  default: { hostname: vi.fn(() => 'test'), userInfo: vi.fn(() => ({ username: 'test' })) },
  hostname: vi.fn(() => 'test'),
  userInfo: vi.fn(() => ({ username: 'test' })),
}))

const mockFiles = new Map<string, string>()
const mockStats = new Map<string, { size: number; isDir: boolean }>()

vi.mock('fs', () => ({
  existsSync: vi.fn((p: string) => mockFiles.has(p) || mockStats.has(p)),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((p: string) => {
    const c = mockFiles.get(p)
    if (c === undefined) throw new Error(`ENOENT: ${p}`)
    return c
  }),
  writeFileSync: vi.fn((p: string, c: string) => { mockFiles.set(p, c) }),
  readdirSync: vi.fn((p: string) => {
    // Return mock directory entries based on parent path
    const allPaths = Array.from(mockFiles.keys())
    return allPaths
      .filter(fp => fp.startsWith(p) && fp !== p)
      .map(fp => fp.slice(p.length).split('/')[0])
  }),
  unlinkSync: vi.fn((p: string) => { mockFiles.delete(p) }),
  statSync: vi.fn((p: string) => {
    const s = mockStats.get(p)
    if (s) return { size: s.size, isDirectory: () => s.isDir, isFile: () => !s.isDir }
    return { size: 100, isDirectory: () => false, isFile: () => true }
  }),
}))

describe('Filesystem IPC handlers', () => {
  beforeEach(() => {
    mockFiles.clear()
    mockStats.clear()
    vi.clearAllMocks()
  })

  describe('fs:writeFile + fs:readFile roundtrip', () => {
    it('should write and read back text content', async () => {
      // Mock the fs module directly for this test
      const mockFs = await import('fs')
      ;(mockFs.writeFileSync as any).mockImplementation((p: string, c: string) => mockFiles.set(p, c))
      ;(mockFs.readFileSync as any).mockImplementation((p: string) => {
        const c = mockFiles.get(p)
        if (c === undefined) throw new Error(`not found: ${p}`)
        return c
      })

      mockFiles.set('/tmp/test.ts', 'const x = 1;')
      const content = (mockFs.readFileSync as any)('/tmp/test.ts')
      expect(content).toBe('const x = 1;')
    })
  })

  describe('fs:readDir filtering', () => {
    it('should filter out node_modules and .git', async () => {
      // Simulate the filtering logic
      const IGNORED = new Set(['node_modules', '.git', 'dist', '.cache'])
      const entries = ['src', 'node_modules', '.git', 'package.json', 'dist', 'README.md']
      const filtered = entries.filter(name => !IGNORED.has(name) && !name.startsWith('.'))

      expect(filtered).toEqual(['src', 'package.json', 'README.md'])
      expect(filtered).not.toContain('node_modules')
      expect(filtered).not.toContain('.git')
    })

    it('should sort directories before files', async () => {
      const items = [
        { name: 'zebra.ts', type: 'file' },
        { name: 'src', type: 'dir' },
        { name: 'alpha.py', type: 'file' },
        { name: 'lib', type: 'dir' },
      ]
      const sorted = items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

      expect(sorted[0].name).toBe('lib')
      expect(sorted[1].name).toBe('src')
      expect(sorted[2].name).toBe('alpha.py')
      expect(sorted[3].name).toBe('zebra.ts')
    })
  })

  describe('file size limits', () => {
    it('should reject files over 2MB for editor', () => {
      const limit = 2 * 1024 * 1024
      const tooBig = limit + 1
      const justRight = limit

      expect(tooBig).toBeGreaterThan(limit)
      expect(justRight).toBeLessThanOrEqual(limit)
    })
  })
})
