import { ipcMain } from 'electron'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { getApiKey } from '../services/storage.js'

// Track active streaming requests for cancellation
const activeRequests = new Map<string, AbortController>()

export { activeRequests }

function safeSend(channel: string, ...args: unknown[]): void {
  // Will be set by main/index.ts via setSafeSend
  const fn = _safeSend
  if (fn) fn(channel, ...args)
}
let _safeSend: ((channel: string, ...args: unknown[]) => void) | null = null
export function setSafeSend(fn: (channel: string, ...args: unknown[]) => void): void {
  _safeSend = fn
}

function getProviderBaseUrl(provider: string): string | undefined {
  switch (provider) {
    case 'openrouter': return 'https://openrouter.ai/api/v1'
    case 'qwen': return 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    case 'copilot': return 'https://api.githubcopilot.com'
    default: return undefined
  }
}

export function registerChatIpc(): void {
  ipcMain.handle('chat:send', async (_event, {
    provider, model, messages, apiKey,
  }: {
    provider: string; model: string;
    messages: Array<{ role: string; content: string }>; apiKey?: string
  }) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const controller = new AbortController()
    activeRequests.set(requestId, controller)

    ;(async () => {
      if (controller.signal.aborted) return
      try {
        const resolvedApiKey = apiKey || getApiKey(provider) || ''
        let content = ''
        let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

        if (provider === 'openai' || provider === 'openrouter' || provider === 'qwen') {
          const result = await chatOpenAICompatible(provider, model, messages, resolvedApiKey, requestId, controller)
          content = result.content; usage = result.usage
        } else if (provider === 'anthropic') {
          const result = await chatAnthropic(model, messages, resolvedApiKey, requestId, controller)
          content = result.content; usage = result.usage
        } else if (provider === 'gemini') {
          const result = await chatGemini(model, messages, resolvedApiKey, requestId, controller)
          content = result.content; usage = result.usage
        } else if (provider === 'copilot') {
          const result = await chatOpenAICompatible('copilot', model, messages, resolvedApiKey, requestId, controller)
          content = result.content; usage = result.usage
        } else {
          throw new Error(`Unknown provider: ${provider}`)
        }

        if (!controller.signal.aborted) {
          safeSend('chat:chunk', { requestId, content, done: true, usage })
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          safeSend('chat:chunk', { requestId, content: `Error: ${err instanceof Error ? err.message : String(err)}`, done: true })
        }
      } finally { activeRequests.delete(requestId) }
    })()

    return requestId
  })

  ipcMain.handle('chat:cancel', (_event, requestId: string) => {
    const controller = activeRequests.get(requestId)
    if (controller) { controller.abort(); activeRequests.delete(requestId) }
  })
}

async function chatOpenAICompatible(
  provider: string, model: string,
  messages: Array<{ role: string; content: string }>,
  apiKey: string, requestId: string, controller: AbortController,
): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
  const client = new OpenAI({ apiKey, baseURL: getProviderBaseUrl(provider), dangerouslyAllowBrowser: true })
  const stream = await client.chat.completions.create(
    { model, messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant' | 'system', content: m.content })), stream: true, stream_options: { include_usage: true } },
    { signal: controller.signal },
  )
  let fullContent = ''
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) { fullContent += delta; if (!controller.signal.aborted) safeSend('chat:chunk', { requestId, content: fullContent, done: false }) }
    if (chunk.usage) {
      usage.inputTokens = (chunk.usage as any).prompt_tokens ?? 0
      usage.outputTokens = (chunk.usage as any).completion_tokens ?? 0
      usage.totalTokens = (chunk.usage as any).total_tokens ?? 0
    }
  }
  return { content: fullContent, usage }
}

async function chatAnthropic(
  model: string, messages: Array<{ role: string; content: string }>,
  apiKey: string, requestId: string, controller: AbortController,
): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
  const client = new Anthropic({ apiKey })
  const systemMessage = messages.find((m) => m.role === 'system')
  const chatMessages = messages.filter((m) => m.role !== 'system')
  const stream = await client.messages.create(
    { model, max_tokens: 4096, system: systemMessage?.content, messages: chatMessages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })), stream: true },
    { signal: controller.signal as never },
  )
  let fullContent = ''
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  for await (const chunk of stream) {
    if (chunk.type === 'message_start' && (chunk as any).message?.usage) usage.inputTokens = (chunk as any).message.usage.input_tokens ?? 0
    if (chunk.type === 'message_delta' && (chunk as any).usage) usage.outputTokens = (chunk as any).usage.output_tokens ?? 0
    if (chunk.type === 'content_block_delta' && 'text' in chunk.delta) { fullContent += chunk.delta.text; if (!controller.signal.aborted) safeSend('chat:chunk', { requestId, content: fullContent, done: false }) }
  }
  usage.totalTokens = usage.inputTokens + usage.outputTokens
  return { content: fullContent, usage }
}

async function chatGemini(
  model: string, messages: Array<{ role: string; content: string }>,
  apiKey: string, requestId: string, controller: AbortController,
): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number } }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`
  const contents = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
  const systemMessage = messages.find((m) => m.role === 'system')
  const body: Record<string, unknown> = { contents }
  if (systemMessage) body.systemInstruction = { parts: [{ text: systemMessage.content }] }

  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal })
  if (!response.ok) throw new Error(`Gemini API error: ${await response.text()}`)

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body from Gemini')

  const decoder = new TextDecoder()
  let fullContent = ''; let buffer = ''
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n'); buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
          if (text) { fullContent += text; if (!controller.signal.aborted) safeSend('chat:chunk', { requestId, content: fullContent, done: false }) }
          if (data.usageMetadata) {
            usage.inputTokens = data.usageMetadata.promptTokenCount ?? 0
            usage.outputTokens = data.usageMetadata.candidatesTokenCount ?? 0
            usage.totalTokens = data.usageMetadata.totalTokenCount ?? 0
          }
        } catch { /* Skip unparseable lines */ }
      }
    }
  }
  return { content: fullContent, usage }
}
