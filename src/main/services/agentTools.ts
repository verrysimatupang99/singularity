import type { AgentTool } from '../providers/types.js'

export const BUILT_IN_TOOLS: AgentTool[] = [
  { name: 'read_file', description: 'Read file content', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, requiresApproval: false },
  { name: 'write_file', description: 'Write/overwrite file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }, requiresApproval: true },
  { name: 'run_terminal', description: 'Run shell command', parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] }, requiresApproval: true },
  { name: 'list_files', description: 'List directory', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, requiresApproval: false },
  { name: 'search_in_files', description: 'Search files for pattern', parameters: { type: 'object', properties: { pattern: { type: 'string' }, directory: { type: 'string' }, filePattern: { type: 'string' } }, required: ['pattern', 'directory'] }, requiresApproval: false },
]

export async function executeTool(tc: { toolName: string; args: Record<string, unknown> }, ws: string): Promise<{ output: string; error?: string }> {
  const { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } = await import('fs')
  const { execSync } = await import('child_process')
  const { join, dirname } = await import('path')
  try {
    switch (tc.toolName) {
      case 'read_file': return { output: readFileSync(tc.args.path as string, 'utf8') }
      case 'write_file': { const p = tc.args.path as string; mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, tc.args.content as string, 'utf8'); return { output: `Written to ${p}` } }
      case 'run_terminal': { const o = execSync(tc.args.command as string, { cwd: (tc.args.cwd as string) || ws, timeout: 30000, maxBuffer: 5*1024*1024 }); return { output: o.toString() || '(no output)' } }
      case 'list_files': { const IG = new Set(['node_modules','.git','dist','build']); const e = readdirSync(tc.args.path as string).filter(n => !IG.has(n) && !n.startsWith('.')).map(n => `${statSync(join(tc.args.path as string, n)).isDirectory()?'D':'F'} ${n}`); return { output: e.join('\n') || '(empty)' } }
      case 'search_in_files': { const o = execSync(`grep -rn '${tc.args.pattern}' '${(tc.args.directory as string)||ws}' 2>/dev/null | head -50`, { timeout: 10000, maxBuffer: 5*1024*1024 }); return { output: o.toString().trim() || '(no matches)' } }
      default: return { output: '', error: `Unknown tool: ${tc.toolName}` }
    }
  } catch (err: any) { return { output: err.stdout?.toString() || '', error: err.stderr?.toString() || err.message } }
}
