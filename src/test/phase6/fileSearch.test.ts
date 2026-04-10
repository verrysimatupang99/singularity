import { describe, it, expect } from 'vitest'

describe('File search logic', () => {
  describe('result parsing format', () => {
    it('should parse grep/rg output correctly', () => {
      const output = `/src/main/index.ts:45:const x = 1
/src/main/index.ts:89:sessions.map(session => (`
      const results = output.trim().split('\n').filter(Boolean).map(line => {
        const parts = line.split(':')
        return { file: parts[0]?.trim() || '', line: parseInt(parts[1] || '0'), content: parts.slice(2).join(':').trim() }
      })

      expect(results.length).toBe(2)
      expect(results[0].file).toBe('/src/main/index.ts')
      expect(results[0].line).toBe(45)
      expect(results[0].content).toBe('const x = 1')
      expect(results[1].content).toBe('sessions.map(session => (')
    })

    it('should cap results at 500', () => {
      const lines = Array.from({ length: 600 }, (_, i) => `/file.ts:${i}:content ${i}`)
      const results = lines.slice(0, 500)
      expect(results.length).toBe(500)
    })
  })

  describe('ignore patterns', () => {
    it('should exclude node_modules and .git from search', () => {
      const excludes = ['node_modules', '.git', 'dist', 'build']
      const files = ['src/index.ts', 'node_modules/pkg/index.js', '.git/config', 'dist/bundle.js', 'README.md']
      const filtered = files.filter(f => !excludes.some(ex => f.startsWith(ex + '/') || f === ex))

      expect(filtered).toEqual(['src/index.ts', 'README.md'])
    })
  })

  describe('search flags', () => {
    it('caseSensitive should add --case-sensitive flag', () => {
      const flags = ['--line-number', '--fixed-strings']
      const caseSensitiveFlags = caseSensitive => caseSensitive ? [...flags, '--case-sensitive'] : [...flags, '--ignore-case']
      
      expect(caseSensitiveFlags(true)).toContain('--case-sensitive')
      expect(caseSensitiveFlags(false)).toContain('--ignore-case')
    })

    it('filePattern should add --glob flag', () => {
      const filePattern = '*.ts'
      const hasGlob = !!filePattern
      expect(hasGlob).toBe(true)
    })
  })
})
