import { vi, describe, it, expect, beforeEach } from 'vitest'

// In-memory file store — defined BEFORE mock so closure captures it
const mockFiles = new Map<string, string>()

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (val: string) => Buffer.from('sf:enc:' + val),
    decryptString: (buf: Buffer) => {
      const str = buf.toString()
      if (str.startsWith('sf:enc:')) return str.slice(7)
      return 'decrypted'
    },
  },
  app: { getPath: () => '/tmp/singularity-e2e' },
}))

vi.mock('os', () => ({
  default: { hostname: () => 'test', userInfo: () => ({ username: 'test' }) },
  hostname: () => 'test',
  userInfo: () => ({ username: 'test' }),
}))

vi.mock('fs', () => ({
  existsSync: (p: string) => mockFiles.has(p),
  mkdirSync: () => {},
  readFileSync: (p: string) => {
    const c = mockFiles.get(p)
    if (c === undefined) throw new Error(`ENOENT: ${p}`)
    return c
  },
  writeFileSync: (p: string, c: string) => { mockFiles.set(p, c) },
  readdirSync: () =>
    Array.from(mockFiles.keys())
      .filter((k) => k.endsWith('.json'))
      .map((k) => k.split('/').pop()!),
  unlinkSync: (p: string) => { mockFiles.delete(p) },
  statSync: () => ({ size: 100 }),
}))

describe('E2E: Full session lifecycle', () => {
  beforeEach(() => {
    mockFiles.clear()
  })

  it('create session -> save messages -> load -> export JSON -> delete', async () => {
    const { createSession, saveSession, loadSession, deleteSession, listSessions } =
      await import('../../main/services/storage.js')

    // 1. Create session
    const session = createSession({ provider: 'openai', model: 'gpt-4o' })
    expect(session.id).toBeDefined()
    expect(session.provider).toBe('openai')

    // 2. Save messages
    const messages = [
      { id: 'm1', role: 'user' as const, content: 'Hello', timestamp: Date.now() },
      { id: 'm2', role: 'assistant' as const, content: 'Hi there!', timestamp: Date.now() },
    ]
    saveSession(session.id, messages)

    // 3. Load session
    const loaded = loadSession(session.id)
    expect(loaded.messages.length).toBe(2)
    expect(loaded.messages[0].content).toBe('Hello')
    expect(loaded.messages[1].content).toBe('Hi there!')

    // 4. Export as JSON (simulate)
    const exported = JSON.stringify({ session: loaded.session, messages: loaded.messages })
    const parsed = JSON.parse(exported)
    expect(parsed.messages.length).toBe(2)

    // 5. Verify session in list
    const sessions = listSessions()
    expect(sessions.length).toBe(1)

    // 6. Delete session
    deleteSession(session.id)

    // 7. Verify gone
    const remaining = listSessions()
    expect(remaining.length).toBe(0)
  })

  it('Markdown export format is correct', async () => {
    const { createSession, saveSession, loadSession } =
      await import('../../main/services/storage.js')

    const session = createSession({ provider: 'anthropic', model: 'claude-sonnet' })
    const messages = [
      { id: 'm1', role: 'user' as const, content: 'What is 2+2?', timestamp: Date.now() },
      { id: 'm2', role: 'assistant' as const, content: '2+2 = 4', timestamp: Date.now(), tokenUsage: { totalTokens: 15 } },
    ]
    saveSession(session.id, messages)
    const loaded = loadSession(session.id)

    // Simulate markdown export
    const lines: string[] = [
      `# ${loaded.session.name}`,
      ``,
      `**Provider:** ${loaded.session.provider} | **Model:** ${loaded.session.model}`,
      ``,
      `---`,
      ``,
    ]
    for (const msg of loaded.messages) {
      const role = msg.role === 'user' ? '**You**' : '**Assistant**'
      lines.push(`### ${role}`)
      lines.push(``)
      lines.push(msg.content)
      if ((msg as any).tokenUsage?.totalTokens) {
        lines.push(``)
        lines.push(`*${(msg as any).tokenUsage.totalTokens.toLocaleString()} tokens*`)
      }
      lines.push(``)
      lines.push(`---`)
      lines.push(``)
    }
    const md = lines.join('\n')

    expect(md).toContain('# ')
    expect(md).toContain('**You**')
    expect(md).toContain('**Assistant**')
    expect(md).toContain('What is 2+2?')
    expect(md).toContain('2+2 = 4')
    expect(md).toContain('15 tokens')
  })

  it('Token usage tracks correctly through session', async () => {
    const { createSession, saveSession, loadSession } =
      await import('../../main/services/storage.js')

    const session = createSession({ provider: 'openai', model: 'gpt-4o' })
    const messages = [
      { id: 'm1', role: 'user' as const, content: 'Hello', timestamp: Date.now(), tokenUsage: { inputTokens: 10 } },
      { id: 'm2', role: 'assistant' as const, content: 'Hi!', timestamp: Date.now(), tokenUsage: { outputTokens: 5, totalTokens: 15 } },
    ]
    saveSession(session.id, messages)
    const loaded = loadSession(session.id)

    expect(loaded.messages[0].tokenUsage?.inputTokens).toBe(10)
    expect(loaded.messages[1].tokenUsage?.outputTokens).toBe(5)
    expect(loaded.messages[1].tokenUsage?.totalTokens).toBe(15)
  })
})
