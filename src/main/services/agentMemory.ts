import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface MemoryEntry {
  id: string
  timestamp: number
  key: string
  value: string
  tags: string[]
  sessionId?: string
}

export class AgentMemory {
  private entries: MemoryEntry[] = []
  private memoryPath: string

  constructor() {
    const configDir = join(homedir(), '.config', 'singularity')
    try { mkdirSync(configDir, { recursive: true }) } catch {}
    this.memoryPath = join(configDir, 'agent-memory.json')
    this.load()
  }

  remember(key: string, value: string, tags: string[] = [], sessionId?: string): void {
    const existing = this.entries.find(e => e.key === key)
    if (existing) { existing.value = value; existing.timestamp = Date.now(); existing.tags = tags }
    else { this.entries.push({ id: Date.now().toString(), timestamp: Date.now(), key, value, tags, sessionId }) }
    this.save()
  }

  recall(query: string, limit: number = 5): MemoryEntry[] {
    const q = query.toLowerCase()
    return this.entries.filter(e => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q) || e.tags.some(t => t.toLowerCase().includes(q))).sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
  }

  forget(key: string): void { this.entries = this.entries.filter(e => e.key !== key); this.save() }
  getAll(): MemoryEntry[] { return [...this.entries] }

  private load() { try { if (existsSync(this.memoryPath)) this.entries = JSON.parse(readFileSync(this.memoryPath, 'utf8')) } catch { this.entries = [] } }
  private save() { try { writeFileSync(this.memoryPath, JSON.stringify(this.entries, null, 2)) } catch {} }
}

export const agentMemory = new AgentMemory()
