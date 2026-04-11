import { ipcMain, shell } from 'electron'
import {
  githubDeviceAuth, githubPoll, qwenDeviceAuth, qwenPoll,
  googleOAuth, importGeminiCliCredentials,
  initiateGitHubDeviceFlow, pollGitHubDeviceToken,
  validateQwenApiKey, openQwenApiKeyPage,
  validateGeminiApiKey, googleOAuthWithClientId,
  setGoogleClientId,
} from '../services/oauthService.js'
import { deleteApiKey, setApiKey } from '../services/storage.js'

let _safeSend: ((channel: string, ...args: unknown[]) => void) | null = null
export function setSafeSend(fn: (channel: string, ...args: unknown[]) => void): void { _safeSend = fn }
function safeSend(channel: string, ...args: unknown[]): void { if (_safeSend) _safeSend(channel, ...args) }

export function registerOAuthIpc(): void {
  // Basic auth handlers
  ipcMain.handle('auth:github-device', async () => {
    try { return await githubDeviceAuth() }
    catch (err) { return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:github-poll', async () => {
    try { return await githubPoll() }
    catch (err) { return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:qwen-device', async () => {
    try { return await qwenDeviceAuth() }
    catch (err) { return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:qwen-poll', async () => {
    try { return await qwenPoll() }
    catch (err) { return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:google-oauth', async (_event, start: boolean, port?: number) => {
    try { return await googleOAuth(start, port) }
    catch (err) { return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:google-set-client-id', async (_event, clientId: string) => {
    try { setGoogleClientId(clientId); return { ok: true } }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:import-gemini', async () => {
    try { return await importGeminiCliCredentials() }
    catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:validate-qwen', async (_event, apiKey: string) => {
    try { return await validateQwenApiKey(apiKey) }
    catch (err) { return { valid: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:open-qwen-console', async () => {
    try { await openQwenApiKeyPage(); return { ok: true } }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:validate-gemini', async (_event, apiKey: string) => {
    try { return await validateGeminiApiKey(apiKey) }
    catch (err) { return { valid: false, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:google-oauth-start', async (_event, clientId: string) => {
    try { return await googleOAuthWithClientId(clientId, true) }
    catch (err) { return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:google-oauth-stop', async (_event, clientId: string) => {
    try { return await googleOAuthWithClientId(clientId, false) }
    catch (err) { return { status: 'error' as const, error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('auth:open-google-cloud-console', async () => {
    await shell.openExternal('https://console.cloud.google.com/apis/credentials')
    return { ok: true }
  })

  // Gemini credential import
  ipcMain.handle('auth:import-gemini-creds', async () => {
    try {
      const { readFileSync, existsSync } = await import('fs')
      const { join } = await import('path')
      const { homedir } = await import('os')
      const credsPath = join(homedir(), '.gemini', 'oauth_creds.json')
      if (!existsSync(credsPath)) return { success: false, error: 'Gemini CLI credentials not found' }
      const raw = readFileSync(credsPath, 'utf8')
      const creds = JSON.parse(raw) as Record<string, unknown>
      if (!creds.access_token || !creds.refresh_token) return { success: false, error: 'Invalid credential format' }
      if (creds.expiry_date && (creds.expiry_date as number) < Date.now()) {
        try {
          const resp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: creds.client_id, client_secret: creds.client_secret, refresh_token: creds.refresh_token, grant_type: 'refresh_token' }),
          })
          if (!resp.ok) return { success: false, error: 'Token expired and refresh failed' }
          const tokens = await resp.json() as Record<string, unknown>
          Object.assign(creds, tokens)
        } catch { return { success: false, error: 'Token expired and refresh failed' } }
      }
      setApiKey('gemini', creds.access_token as string)
      return { success: true }
    } catch (err) { return { success: false, error: err instanceof Error ? err.message : String(err) } }
  })

  // Device flow auth (generic)
  ipcMain.handle('auth:connect', async (_event, { providerId }: { providerId: string }) => {
    try {
      if (providerId === 'github-copilot') {
        const deviceInfo = await initiateGitHubDeviceFlow()
        shell.openExternal(deviceInfo.verification_uri)
        return { providerId, user_code: deviceInfo.user_code, verification_uri: deviceInfo.verification_uri }
      }
      return { error: 'Provider not supported' }
    } catch (err) { return { error: err instanceof Error ? err.message : String(err) } }
  })

  ipcMain.handle('auth:connect-poll', async (_event, {
    providerId, device_code, interval,
  }: { providerId: string; device_code: string; interval: number }) => {
    try {
      if (providerId === 'github-copilot') {
        const controller = new AbortController()
        const result = await pollGitHubDeviceToken(device_code, interval, controller.signal)
        if ('access_token' in result) {
          setApiKey('github-copilot', result.access_token)
          safeSend('auth:status:update', { providerId: 'github-copilot', connected: true })
        }
        return result
      }
      return { error: 'Provider not supported' }
    } catch (err) { return { error: err instanceof Error ? err.message : String(err) } }
  })

  ipcMain.handle('auth:disconnect', (_event, { providerId }: { providerId: string }) => {
    try { deleteApiKey(providerId); safeSend('auth:status:update', { providerId, connected: false }) }
    catch (err) { console.error('auth:disconnect error:', err); throw err }
  })
}
