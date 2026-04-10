import { describe, it, expect } from 'vitest'
import { applyUnifiedDiff, countDiffLines, parseDiffHunks, generateUnifiedDiff } from '../../main/utils/diff.js'

describe('Diff utilities', () => {
  describe('countDiffLines', () => {
    it('should count added and removed lines correctly', () => {
      const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,4 @@
 const x = 1
-const y = 2
+const y = 3
+const z = 4
 const w = 5`
      const counts = countDiffLines(diff)
      expect(counts.added).toBe(2)
      expect(counts.removed).toBe(1)
    })

    it('should not count +++ and --- headers', () => {
      const diff = `--- a/file.ts
+++ b/file.ts
+added line`
      const counts = countDiffLines(diff)
      expect(counts.added).toBe(1)
      expect(counts.removed).toBe(0)
    })
  })

  describe('parseDiffHunks', () => {
    it('should parse a single hunk correctly', () => {
      const diff = `--- a/test.ts
+++ b/test.ts
@@ -10,3 +10,4 @@
 context
-removed
+added
 context`
      const hunks = parseDiffHunks(diff)
      expect(hunks.length).toBe(1)
      expect(hunks[0].oldStart).toBe(10)
      expect(hunks[0].newStart).toBe(10)
      expect(hunks[0].additions).toBe(1)
      expect(hunks[0].deletions).toBe(1)
    })

    it('should parse multiple hunks', () => {
      const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,3 +1,3 @@
-a
+b
@@ -10,3 +10,4 @@
 x
+y
 z`
      const hunks = parseDiffHunks(diff)
      expect(hunks.length).toBe(2)
    })
  })

  describe('applyUnifiedDiff', () => {
    it('should apply a simple hunk correctly', () => {
      const original = 'line1\nline2\nline3\nline4'
      const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,4 +1,4 @@
 line1
-line2
+line2_modified
 line3
 line4`
      const result = applyUnifiedDiff(original, diff)
      expect(result).toBe('line1\nline2_modified\nline3\nline4')
    })

    it('should throw on stale diff with context mismatch', () => {
      const original = 'line1\nWRONG\nline3\nline4'
      const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,4 +1,4 @@
 line1
-line2
+line2_modified
 line3
 line4`
      expect(() => applyUnifiedDiff(original, diff)).toThrow()
    })

    it('should apply additions at end of file', () => {
      const original = 'line1\nline2'
      const diff = `--- a/test.ts
+++ b/test.ts
@@ -1,2 +1,3 @@
 line1
 line2
+line3`
      const result = applyUnifiedDiff(original, diff)
      expect(result).toBe('line1\nline2\nline3')
    })

    it('should return original when diff is empty', () => {
      const original = 'line1\nline2'
      const result = applyUnifiedDiff(original, '')
      expect(result).toBe(original)
    })
  })

  describe('generateUnifiedDiff', () => {
    it('should generate a valid unified diff', () => {
      const diff = generateUnifiedDiff('a/test.ts', 'b/test.ts', 'line1\nline2\nline3', 'line1\nmodified\nline3')
      expect(diff).toContain('--- b/test.ts')
      expect(diff).toContain('+++ b/test.ts')
      expect(diff).toContain('-line2')
      expect(diff).toContain('+modified')
    })

    it('should produce parseable output from countDiffLines', () => {
      const diff = generateUnifiedDiff('a/test.ts', 'b/test.ts', 'a\nb\nc', 'a\nB\nc\nD')
      const counts = countDiffLines(diff)
      expect(counts.added).toBeGreaterThanOrEqual(1)
      expect(counts.removed).toBeGreaterThanOrEqual(1)
    })
  })
})
