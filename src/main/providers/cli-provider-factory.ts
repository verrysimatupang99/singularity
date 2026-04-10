import { AIProvider, AuthMethod, ModelInfo, ChatMessage, ChatOptions, StreamChunk, ChatResponse } from './types.js'
import { CliSessionManager, CliSession, StreamChunk as CliStreamChunk } from '../services/cliSessionManager.js'

export interface CliProviderConfig {
  id: string
  name: string
  binaryNames: string[]
  models: ModelInfo[]
  description: string
}

/**
 * Map CLI-internal StreamChunk types to the AIProvider StreamChunk type.
 */
function mapChunk(chunk: CliStreamChunk): StreamChunk {
  if (chunk.type === 'agent_message_chunk') {
    return {
      type: 'text',
      content: chunk.content?.text ?? '',
    }
  }
  if (chunk.type === 'agent_thought_chunk') {
    return {
      type: 'thought',
      content: chunk.content?.text ?? '',
    }
  }
  if (chunk.type === 'tool_call' && chunk.toolCall) {
    return {
      type: 'tool_call',
      content: '',
      toolCall: {
        id: chunk.toolCall.id,
        name: chunk.toolCall.kind,
        input: { command: chunk.toolCall.command, args: chunk.toolCall.args },
      },
    }
  }
  // end_turn or anything else
  return {
    type: 'text',
    content: '',
  }
}

export function createCliProvider(
  config: CliProviderConfig,
  cliManager: CliSessionManager,
): AIProvider {
  // Track active sessions for cancellation
  const activeSessions = new Map<string, CliSession>()

  return {
    id: config.id,
    name: config.name,
    authMethods: [
      {
        type: 'oauth-import' as const,
        label: config.name,
        description: config.description,
      },
    ],

    async isAvailable(): Promise<boolean> {
      const detected = await cliManager.detectCliBinaries()
      return config.binaryNames.some((name) => name in detected)
    },

    async getModels(): Promise<ModelInfo[]> {
      return config.models
    },

    async chat(
      messages: ChatMessage[],
      options: ChatOptions,
      onChunk: (chunk: StreamChunk) => void,
    ): Promise<ChatResponse> {
      // Find an available binary
      const detected = await cliManager.detectCliBinaries()
      const binaryName = config.binaryNames.find((name) => name in detected)
      if (!binaryName) {
        throw new Error(`${config.name} CLI not found in PATH`)
      }

      // Get the last user message as prompt
      const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')
      if (!lastUserMessage || typeof lastUserMessage.content !== 'string') {
        throw new Error('No user message found')
      }

      const requestId = `${config.id}_${Date.now()}`
      let responseText = ''

      // Spawn CLI session
      const session = await cliManager.spawn(binaryName, process.cwd())
      activeSessions.set(requestId, session)

      // Wire up streaming
      const unsub = session.onStream((chunk: CliStreamChunk) => {
        if (chunk.type === 'end_turn') {
          // Stream ended
          return
        }
        const mapped = mapChunk(chunk)
        if (mapped.content) {
          responseText += mapped.content
        }
        onChunk(mapped)
      })

      try {
        // Handle abort signal
        if (options.signal) {
          options.signal.addEventListener('abort', () => {
            void session.terminate()
          })
        }

        // Send the prompt
        session.sendPrompt(lastUserMessage.content)

        // Wait for the session to finish by polling status or listening to end_turn
        await new Promise<void>((resolve, reject) => {
          const unsubEnd = session.onStream((chunk: CliStreamChunk) => {
            if (chunk.type === 'end_turn') {
              unsubEnd()
              if (chunk.stopReason === 'error') {
                reject(new Error(chunk.errorMessage ?? 'Unknown error from CLI'))
              } else {
                resolve()
              }
            }
          })

          // Timeout fallback (5 minutes)
          setTimeout(() => {
            unsubEnd()
            reject(new Error('CLI request timed out after 5 minutes'))
          }, 5 * 60 * 1000)
        })
      } finally {
        unsub()
        activeSessions.delete(requestId)
        await cliManager.terminateSession(session.getInfo().sessionId)
      }

      return {
        id: requestId,
        content: responseText,
        model: options.model,
        stopReason: 'end_turn',
      }
    },

    cancel(requestId: string): void {
      const session = activeSessions.get(requestId)
      if (session) {
        void session.terminate()
        activeSessions.delete(requestId)
      }
    },
  }
}
