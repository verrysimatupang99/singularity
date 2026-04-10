import { describe, it, expect } from 'vitest'

describe('MCP Integration', () => {
  it('getMcpManager() returns singleton', async () => {
    const { getMcpManager } = await import('../../main/services/mcpManager.js')
    const a = getMcpManager()
    const b = getMcpManager()
    expect(a).toBe(b)
  })

  it('mcp_call tool is in BUILT_IN_TOOLS', async () => {
    const { BUILT_IN_TOOLS } = await import('../../main/services/agentTools.js')
    const mcpTool = BUILT_IN_TOOLS.find(t => t.name === 'mcp_call')
    expect(mcpTool).toBeDefined()
    expect(mcpTool?.requiresApproval).toBe(true)
  })

  it('mcp_call has correct parameters', async () => {
    const { BUILT_IN_TOOLS } = await import('../../main/services/agentTools.js')
    const mcpTool = BUILT_IN_TOOLS.find(t => t.name === 'mcp_call')
    expect(mcpTool?.parameters).toHaveProperty('properties.server')
    expect(mcpTool?.parameters).toHaveProperty('properties.tool')
  })

  it('CUA tools require approval', async () => {
    const { BUILT_IN_TOOLS } = await import('../../main/services/agentTools.js')
    for (const name of ['cua_click', 'cua_type', 'cua_key']) {
      const tool = BUILT_IN_TOOLS.find(t => t.name === name)
      expect(tool).toBeDefined()
      expect(tool?.requiresApproval).toBe(true)
    }
  })

  it('total tool count', async () => {
    const { BUILT_IN_TOOLS } = await import('../../main/services/agentTools.js')
    expect(BUILT_IN_TOOLS.length).toBeGreaterThanOrEqual(13)
  })
})
