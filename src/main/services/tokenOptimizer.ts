import type { ChatMessage } from '../providers/types.js'
import { getApiKey } from './storage.js'
import OpenAI from 'openai'

export class TokenOptimizer {
  async rollingSummary(messages: ChatMessage[], keepLast: number = 10, provider?: string, model?: string): Promise<ChatMessage[]> {
    const toSummarize = messages.slice(1, -keepLast)
    if (toSummarize.length < 5) return messages
    if (!provider || !model) return this.truncateToFit(messages, 50000)

    const apiKey = getApiKey(provider)
    if (!apiKey) return this.truncateToFit(messages, 50000)

    try {
      const client = new OpenAI({ apiKey, baseURL: provider === 'qwen' ? 'https://dashscope.aliyuncs.com/compatible-mode/v1' : provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : undefined })
      const summaryText = toSummarize.map(m => `${m.role}: ${m.content.slice(0, 500)}`).join('\n\n')
      const resp = await client.chat.completions.create({
        model, messages: [{ role: 'user' as const, content: `Summarize this conversation history concisely. Preserve key facts, decisions, code snippets, and context. Format as bullet points.\n\n${summaryText}` }],
        max_tokens: 1024,
      })
      const summary = resp.choices[0]?.message?.content || 'Conversation summary unavailable.'
      return [
        messages[0],
        { id: 'summary_' + Date.now(), role: 'user', content: `[Previous conversation summary]\n${summary}`, timestamp: Date.now() } as ChatMessage,
        ...messages.slice(-keepLast),
      ]
    } catch {
      return this.truncateToFit(messages, 50000)
    }
  }

  truncateToFit(messages: ChatMessage[], maxTokens: number): ChatMessage[] {
    const estimate = (m: ChatMessage) => Math.ceil(m.content.length / 4)
    let total = messages.reduce((sum, m) => sum + estimate(m), 0)
    if (total <= maxTokens) return messages
    const result = [...messages]
    let i = 1
    while (total > maxTokens && i < result.length - 2) { total -= estimate(result[i]); result.splice(i, 1) }
    return result
  }

  deduplicateFileAttachments(messages: ChatMessage[]): ChatMessage[] {
    const seenFiles = new Map<string, number>()
    messages.forEach((m, i) => { (m as any).attachments?.forEach((a: any) => seenFiles.set(a.name, i)) })
    return messages.map((m, i) => ({ ...m, attachments: ((m as any).attachments || []).filter((a: any) => seenFiles.get(a.name) === i) }))
  }
}

export const tokenOptimizer = new TokenOptimizer()
