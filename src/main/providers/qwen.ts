import { OpenAICompatibleProvider } from './openai-compatible.js'
import { ModelInfo, AuthMethod } from './types.js'
import { getApiKey } from '../services/storage.js'

export class QwenProvider extends OpenAICompatibleProvider {
  readonly id = 'qwen'
  readonly name = 'Qwen / Alibaba Cloud'
  readonly authMethods: AuthMethod[] = [
    { type: 'api-key', label: 'DashScope API Key', description: 'Get your key from platform.aliyun.com/bailian' },
  ]

  private static readonly MODELS: ModelInfo[] = [
    { id: 'qwen-max-latest', name: 'Qwen Max (Latest)', contextWindow: 32768, maxOutputTokens: 8192, supportsTools: true, supportsVision: false, supportsReasoning: false },
    { id: 'qwen-plus-latest', name: 'Qwen Plus (Latest)', contextWindow: 131072, maxOutputTokens: 8192, supportsTools: true, supportsVision: false, supportsReasoning: false },
    { id: 'qwen-turbo-latest', name: 'Qwen Turbo (Latest)', contextWindow: 131072, maxOutputTokens: 8192, supportsTools: true, supportsVision: false, supportsReasoning: false },
    { id: 'qwen3-235b-a22b', name: 'Qwen3 235B-A22B', contextWindow: 131072, maxOutputTokens: 16384, supportsTools: true, supportsVision: false, supportsReasoning: true },
    { id: 'qwen3-72b', name: 'Qwen3 72B', contextWindow: 131072, maxOutputTokens: 16384, supportsTools: true, supportsVision: false, supportsReasoning: true },
    { id: 'qwen3-32b', name: 'Qwen3 32B', contextWindow: 131072, maxOutputTokens: 16384, supportsTools: true, supportsVision: false, supportsReasoning: true },
    { id: 'qwen3-14b', name: 'Qwen3 14B', contextWindow: 131072, maxOutputTokens: 8192, supportsTools: true, supportsVision: false, supportsReasoning: true },
    { id: 'qwen3-8b', name: 'Qwen3 8B', contextWindow: 131072, maxOutputTokens: 8192, supportsTools: true, supportsVision: false, supportsReasoning: true },
    { id: 'qvq-max', name: 'QVQ-Max (Vision)', contextWindow: 32768, maxOutputTokens: 8192, supportsTools: false, supportsVision: true, supportsReasoning: true },
    { id: 'qwen-vl-max', name: 'Qwen VL Max', contextWindow: 32768, maxOutputTokens: 2048, supportsTools: false, supportsVision: true, supportsReasoning: false },
    { id: 'qwen-coder-plus', name: 'Qwen Coder Plus', contextWindow: 131072, maxOutputTokens: 8192, supportsTools: true, supportsVision: false, supportsReasoning: false },
  ]

  constructor() {
    super('qwen', 'Qwen / Alibaba Cloud', 'https://dashscope.aliyuncs.com/compatible-mode/v1')
  }

  async isAvailable(): Promise<boolean> {
    return !!getApiKey('qwen')
  }

  async getModels(): Promise<ModelInfo[]> {
    return QwenProvider.MODELS
  }
}
