import { createPatch } from 'diff'

export interface DiffHunk {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
  additions: number
  deletions: number
}

/**
 * Parse unified diff into hunks.
 */
export function parseDiffHunks(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  const lines = diff.split('\n')
  let currentHunk: DiffHunk | null = null

  for (const line of lines) {
    const hunkHeader = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
    if (hunkHeader) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = {
        oldStart: parseInt(hunkHeader[1]),
        oldLines: parseInt(hunkHeader[2] || '1'),
        newStart: parseInt(hunkHeader[3]),
        newLines: parseInt(hunkHeader[4] || '1'),
        lines: [],
        additions: 0,
        deletions: 0,
      }
      continue
    }
    if (currentHunk) {
      currentHunk.lines.push(line)
      if (line.startsWith('+') && !line.startsWith('+++')) currentHunk.additions++
      if (line.startsWith('-') && !line.startsWith('---')) currentHunk.deletions++
    }
  }
  if (currentHunk) hunks.push(currentHunk)
  return hunks
}

/**
 * Apply a unified diff to original content.
 * Throws if context doesn't match (stale diff).
 */
export function applyUnifiedDiff(original: string, diff: string): string {
  const hunks = parseDiffHunks(diff)
  if (hunks.length === 0) return original

  const origLines = original.split('\n')

  // Sort hunks by oldStart descending (apply from bottom to top)
  const sorted = [...hunks].sort((a, b) => b.oldStart - a.oldStart)

  let result = [...origLines]

  for (const hunk of sorted) {
    const startIdx = hunk.oldStart - 1  // 0-indexed
    const lines = hunk.lines

    // Reconstruct the expected original lines from context and deletions
    const expectedOriginalLines: string[] = []
    for (const l of lines) {
      if (l.startsWith(' ') || l.startsWith('-')) {
        expectedOriginalLines.push(l.startsWith(' ') ? l.slice(1) : l.slice(1))
      }
    }

    // Verify context matches
    const actualSlice = result.slice(startIdx, startIdx + expectedOriginalLines.length)
    if (actualSlice.join('\n') !== expectedOriginalLines.join('\n')) {
      throw new Error(
        `Diff context mismatch at line ${hunk.oldStart}. ` +
        `The file has been modified since the diff was generated. ` +
        `Expected: "${expectedOriginalLines.slice(0, 3).join('", "')}"`
      )
    }

    // Build replacement lines (context + additions)
    const replacementLines: string[] = []
    for (const l of lines) {
      if (l.startsWith(' ') || l.startsWith('+')) {
        replacementLines.push(l.startsWith(' ') ? l.slice(1) : l.slice(1))
      }
    }

    // Replace
    result.splice(startIdx, expectedOriginalLines.length, ...replacementLines)
  }

  return result.join('\n')
}

/**
 * Count added and removed lines in a diff.
 */
export function countDiffLines(diff: string): { added: number; removed: number } {
  const lines = diff.split('\n')
  return {
    added: lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length,
    removed: lines.filter(l => l.startsWith('-') && !l.startsWith('---')).length,
  }
}

/**
 * Generate unified diff between two strings.
 */
export function generateUnifiedDiff(oldPath: string, newPath: string, oldContent: string, newContent: string): string {
  return createPatch(newPath, oldContent, newContent, undefined, undefined, { context: 3 })
}
