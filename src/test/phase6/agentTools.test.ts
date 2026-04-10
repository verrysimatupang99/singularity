import { describe, it, expect, vi } from 'vitest'
import { BUILT_IN_TOOLS, executeTool } from '../../main/services/agentTools.js'

describe('Agent Tools', () => {
  describe('BUILT_IN_TOOLS', () => {
    it('should have 9 tools', () => {
      expect(BUILT_IN_TOOLS.length).toBe(9)
    })

    it('should have correct tool names', () => {
      const names = BUILT_IN_TOOLS.map(t => t.name)
      expect(names).toContain('read_file')
      expect(names).toContain('write_file')
      expect(names).toContain('run_terminal')
      expect(names).toContain('list_files')
      expect(names).toContain('search_in_files')
    })

    it('should mark write_file and run_terminal as requiring approval', () => {
      const writeTool = BUILT_IN_TOOLS.find(t => t.name === 'write_file')
      const terminalTool = BUILT_IN_TOOLS.find(t => t.name === 'run_terminal')
      const readTool = BUILT_IN_TOOLS.find(t => t.name === 'read_file')

      expect(writeTool?.requiresApproval).toBe(true)
      expect(terminalTool?.requiresApproval).toBe(true)
      expect(readTool?.requiresApproval).toBe(false)
    })

    it('should have JSON schema parameters for each tool', () => {
      for (const tool of BUILT_IN_TOOLS) {
        expect(tool.parameters).toHaveProperty('type')
        expect(tool.parameters).toHaveProperty('properties')
        expect(tool.parameters).toHaveProperty('required')
      }
    })
  })

  describe('executeTool', () => {
    it('should return error for unknown tool', async () => {
      const result = await executeTool({ toolName: 'nonexistent', args: {} }, '/tmp')
      expect(result.error).toContain('Unknown tool')
    })

    it('run_terminal should have requiresApproval: true', () => {
      const tool = BUILT_IN_TOOLS.find(t => t.name === 'run_terminal')
      expect(tool?.requiresApproval).toBe(true)
    })

    it('list_files should have requiresApproval: false', () => {
      const tool = BUILT_IN_TOOLS.find(t => t.name === 'list_files')
      expect(tool?.requiresApproval).toBe(false)
    })
  })
})
