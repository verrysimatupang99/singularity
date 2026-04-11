import type { AgentTool } from '../providers/types.js'

export const BUILT_IN_TOOLS: AgentTool[] = [
  { name: 'read_file', description: 'Read file content', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, requiresApproval: false },
  { name: 'write_file', description: 'Write/overwrite file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }, requiresApproval: true },
  { name: 'run_terminal', description: 'Run shell command', parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string' } }, required: ['command'] }, requiresApproval: true },
  { name: 'list_files', description: 'List directory', parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] }, requiresApproval: false },
  { name: 'search_in_files', description: 'Search files for pattern', parameters: { type: 'object', properties: { pattern: { type: 'string' }, directory: { type: 'string' }, filePattern: { type: 'string' } }, required: ['pattern', 'directory'] }, requiresApproval: false },
  { name: 'remember', description: 'Store information for future sessions', parameters: { type: 'object', properties: { key: { type: 'string' }, value: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['key', 'value'] }, requiresApproval: false },
  { name: 'recall', description: 'Retrieve information from memory', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] }, requiresApproval: false },
  { name: 'forget', description: 'Delete a memory entry', parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] }, requiresApproval: true },
  { name: 'take_screenshot', description: 'Capture screenshot of the current Singularity window', parameters: { type: 'object', properties: {}, required: [] }, requiresApproval: false },
  { name: 'mcp_call', description: 'Call a tool on a running MCP server', parameters: { type: 'object', properties: { server: { type: 'string', description: 'MCP server name' }, tool: { type: 'string', description: 'Tool name' }, args: { type: 'object', description: 'Tool arguments' } }, required: ['server', 'tool'] }, requiresApproval: true },
]

export async function executeTool(tc: { toolName: string; args: Record<string, unknown> }, ws: string): Promise<{ output: string; error?: string }> {
  const { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } = await import('fs')
  const { execSync } = await import('child_process')
  const { join, dirname } = await import('path')

  function validateString(input: unknown, maxLen = 10000): string {
    if (typeof input !== 'string') throw new Error('Expected string')
    if (input.length > maxLen) throw new Error(`Input too long (max ${maxLen})`)
    return input
  }

  try {
    switch (tc.toolName) {
      case 'read_file': return { output: readFileSync(tc.args.path as string, 'utf8') }
      case 'write_file': { const p = tc.args.path as string; mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, tc.args.content as string, 'utf8'); return { output: `Written to ${p}` } }
      case 'run_terminal': {
        const cmd = validateString(tc.args.command, 50000)
        const cwd = tc.args.cwd ? validateString(tc.args.cwd, 4096) : ws
        const o = execSync(cmd, { cwd, timeout: 60000, maxBuffer: 5*1024*1024 })
        return { output: o.toString() || '(no output)' }
      }
      case 'list_files': { const IG = new Set(['node_modules','.git','dist','build']); const e = readdirSync(tc.args.path as string).filter(n => !IG.has(n) && !n.startsWith('.')).map(n => `${statSync(join(tc.args.path as string, n)).isDirectory()?'D':'F'} ${n}`); return { output: e.join('\n') || '(empty)' } }
      case 'search_in_files': {
        const pattern = validateString(tc.args.pattern, 500)
        const dir = validateString((tc.args.directory as string) || ws, 4096)
        const { execFileSync } = await import('child_process')
        try {
          const output = execFileSync('grep', ['-rn', '-F', '--', pattern, dir], { timeout: 10000, maxBuffer: 5*1024*1024 })
          return { output: output.toString().trim().split('\n').slice(0, 50).join('\n') || '(no matches)' }
        } catch { return { output: '(no matches)' } }
      }
      case 'remember': {
        const { agentMemory } = await import('./agentMemory.js')
        agentMemory.remember(tc.args.key as string, tc.args.value as string, (tc.args.tags as string[]) || [])
        return { output: `Memory stored: ${tc.args.key}` }
      }
      case 'recall': {
        const { agentMemory } = await import('./agentMemory.js')
        const memories = agentMemory.recall(tc.args.query as string)
        return { output: memories.length ? memories.map(m => `[${m.key}]: ${m.value}`).join('\n') : '(no memories found)' }
      }
      case 'forget': {
        const { agentMemory } = await import('./agentMemory.js')
        agentMemory.forget(tc.args.key as string)
        return { output: `Memory deleted: ${tc.args.key}` }
      }
      case 'take_screenshot': {
        return { output: '', error: 'Screenshot not available (Computer Use feature is deferred). Use file reading to inspect code instead.' }
      }
      case 'mcp_call': {
        const { getMcpManager } = await import('./mcpManager.js')
        const mgr = getMcpManager()
        const result = await mgr.callTool(tc.args.server as string, tc.args.tool as string, (tc.args.args as Record<string, unknown>) || {})
        return { output: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }
      }
      default: {
        const { pluginLoader } = await import('./pluginLoader.js')
        const handler = pluginLoader.getHandler(tc.toolName)
        if (handler) return handler(tc.args)
        return { output: '', error: `Unknown tool: ${tc.toolName}` }
      }
    }
  } catch (err: any) { return { output: err.stdout?.toString() || '', error: err.stderr?.toString() || err.message } }
}
