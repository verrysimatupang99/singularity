/**
 * IPC Module Registry
 * All IPC handlers are organized into separate modules.
 * Call registerAllIpc() from main/index.ts to register everything.
 */

import { registerSessionIpc } from './sessions.js'
import { registerChatIpc, setSafeSend as setChatSafeSend, activeRequests } from './chat.js'
import { registerSettingsIpc, registerAuthIpc, getApiKey } from './settings.js'
import { registerCliIpc, setCliManager, setSafeSend as setCliSafeSend } from './cli.js'
import { registerMcpIpc, setMcpManager } from './mcp.js'
import { registerOAuthIpc, setSafeSend as setOAuthSafeSend } from './auth.js'
import { registerAgentIpc, setSafeSend as setAgentSafeSend } from './agent.js'
import { registerFilesIpc } from './files.js'
import { registerTerminalIpc, setSafeSend as setTerminalSafeSend, getTerminals } from './terminal.js'
import { registerProvidersIpc, initProviders, registry } from './providers.js'
import { registerPluginsIpc } from './plugins.js'
import { registerTokensIpc } from './tokens.js'
import { registerWindowIpc } from './window.js'
import { registerStitchIpc } from './stitch.js'
import { registerSecurityIpc } from './security.js'
import { registerOnboardingIpc } from './onboarding.js'

export {
  activeRequests, getApiKey, getTerminals,
  initProviders, registry,
  setCliManager, setMcpManager,
}

export function registerAllIpc(safeSend: (channel: string, ...args: unknown[]) => void, preloadPath: string): void {
  // Wire up safeSend to all modules that need it
  setChatSafeSend(safeSend)
  setCliSafeSend(safeSend)
  setOAuthSafeSend(safeSend)
  setAgentSafeSend(safeSend)
  setTerminalSafeSend(safeSend)

  // Store preload path for window creation
  ;(globalThis as any)._preloadPath = preloadPath

  // Register all IPC handlers
  registerSessionIpc()
  registerChatIpc()
  registerSettingsIpc()
  registerAuthIpc()
  registerCliIpc()
  registerMcpIpc()
  registerOAuthIpc()
  registerAgentIpc()
  registerFilesIpc()
  registerTerminalIpc()
  registerProvidersIpc()
  registerPluginsIpc()
  registerTokensIpc()
  registerWindowIpc()
  registerStitchIpc()
  registerSecurityIpc()
  registerOnboardingIpc()
}
