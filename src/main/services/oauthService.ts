import { createServer, Server, IncomingMessage, ServerResponse } from 'http'
import { randomBytes, createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GithubDeviceAuthPending {
  status: 'pending'
  userCode: string
  verificationUri: string
  interval: number
}

export interface GithubDeviceAuthComplete {
  status: 'complete'
  accessToken: string
}

export interface GithubDeviceAuthError {
  status: 'error'
  error: string
}

export type GithubDeviceAuthResult =
  | GithubDeviceAuthPending
  | GithubDeviceAuthComplete
  | GithubDeviceAuthError

export interface GoogleOAuthPending {
  status: 'pending'
  authUrl: string
}

export interface GoogleOAuthComplete {
  status: 'complete'
  tokens: { accessToken: string; refreshToken: string }
}

export interface GoogleOAuthError {
  status: 'error'
  error: string
}

export type GoogleOAuthResult = GoogleOAuthPending | GoogleOAuthComplete | GoogleOAuthError

export interface GeminiImportResult {
  success: boolean
  tokens?: { accessToken: string; refreshToken: string }
  error?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// GitHub Copilot OAuth - Device Flow
const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/oauth/device/code'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_CLIENT_ID = 'Iv1.b50988d7db51a44e' // Copilot CLI client ID
const GITHUB_SCOPE = 'read:user'

// Google OAuth 2.0 - PKCE Flow
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'openid',
  'email',
  'profile',
]

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let githubDeviceFlowState: {
  deviceCode: string
  interval: number
  expiresAt: number
  accessToken: string | null
} | null = null

let googleOAuthServer: Server | null = null
let googleOAuthResolver: ((result: GoogleOAuthResult) => void) | null = null
let googleOAuthState: { codeVerifier: string; state: string; redirectUri: string } | null = null

// ---------------------------------------------------------------------------
// GitHub Copilot Device Flow (stateful wrappers)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Low-level GitHub device flow functions (composable, stateless)
// ---------------------------------------------------------------------------

export async function initiateGitHubDeviceFlow(): Promise<{
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}> {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_SCOPE,
    }),
  })

  if (!response.ok) {
    throw new Error(`GitHub device code request failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as Record<string, unknown>

  if (data.error) {
    throw new Error(String(data.error_description || data.error))
  }

  return {
    device_code: String(data.device_code),
    user_code: String(data.user_code),
    verification_uri: String(data.verification_uri),
    expires_in: Number(data.expires_in) || 900,
    interval: Number(data.interval) || 5,
  }
}

export async function pollGitHubDeviceToken(
  device_code: string,
  interval: number,
  signal?: AbortSignal,
): Promise<{ access_token: string } | { error: string; pending: boolean }> {
  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
      signal,
    })

    if (!response.ok) {
      const data = (await response.json()) as Record<string, unknown>
      const error = String(data.error || 'unknown_error')

      if (error === 'authorization_pending') {
        return { error, pending: true }
      }
      if (error === 'slow_down') {
        return { error: 'slow_down', pending: true }
      }
      if (error === 'expired_token') {
        return { error: 'expired', pending: false }
      }
      return { error, pending: false }
    }

    const data = (await response.json()) as Record<string, unknown>
    const accessToken = String(data.access_token)
    return { access_token: accessToken }
  } catch (err) {
    if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
      throw new Error('Device flow polling was cancelled')
    }
    throw err
  }
}

export async function githubDeviceAuth(): Promise<GithubDeviceAuthResult> {
  try {
    const response = await fetch(GITHUB_DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        scope: GITHUB_SCOPE,
      }),
    })

    if (!response.ok) {
      throw new Error(`GitHub device code request failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as Record<string, unknown>

    if (data.error) {
      throw new Error(String(data.error_description || data.error))
    }

    githubDeviceFlowState = {
      deviceCode: String(data.device_code),
      interval: (data.interval as number) || 5,
      expiresAt: Date.now() + (Number(data.expires_in) || 900) * 1000,
      accessToken: null,
    }

    return {
      status: 'pending',
      userCode: String(data.user_code),
      verificationUri: String(data.verification_uri),
      interval: githubDeviceFlowState.interval,
    }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function githubPoll(): Promise<GithubDeviceAuthResult> {
  if (!githubDeviceFlowState) {
    return { status: 'error', error: 'No active device flow session. Call githubDeviceAuth first.' }
  }

  if (Date.now() > githubDeviceFlowState.expiresAt) {
    githubDeviceFlowState = null
    return { status: 'error', error: 'Device code expired. Please start a new auth flow.' }
  }

  if (githubDeviceFlowState.accessToken) {
    return { status: 'complete', accessToken: githubDeviceFlowState.accessToken }
  }

  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        device_code: githubDeviceFlowState.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    if (!response.ok) {
      throw new Error(`Token request failed: ${response.status}`)
    }

    const data = (await response.json()) as Record<string, unknown>

    if (data.error === 'authorization_pending') {
      return {
        status: 'pending',
        userCode: '',
        verificationUri: '',
        interval: githubDeviceFlowState.interval,
      }
    }

    if (data.error === 'slow_down') {
      githubDeviceFlowState.interval += 5
      return {
        status: 'pending',
        userCode: '',
        verificationUri: '',
        interval: githubDeviceFlowState.interval,
      }
    }

    if (data.error) {
      return {
        status: 'error',
        error: String(data.error_description || data.error),
      }
    }

    const accessToken = String(data.access_token)
    githubDeviceFlowState.accessToken = accessToken

    const verified = await verifyGithubToken(accessToken)
    if (!verified) {
      githubDeviceFlowState = null
      return { status: 'error', error: 'Token verification failed' }
    }

    return { status: 'complete', accessToken }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function verifyGithubToken(token: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    return response.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Qwen API Key Validation
// ---------------------------------------------------------------------------

const QWEN_API_KEY_DOC_URL = 'https://dashscope.console.aliyun.com/apiKey'
const QWEN_VALIDATE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/models'

export async function validateQwenApiKey(apiKey: string): Promise<{ valid: boolean; models?: string[]; error?: string }> {
  try {
    const response = await fetch(QWEN_VALIDATE_URL, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(8000),
    })
    if (response.status === 401) return { valid: false, error: 'Invalid API key' }
    if (!response.ok) return { valid: false, error: `Validation failed: ${response.status}` }
    const data = await response.json() as { data?: { id: string }[] }
    const models = data.data?.map(m => m.id) || []
    return { valid: true, models }
  } catch (err: any) { return { valid: false, error: err.message } }
}

export async function openQwenApiKeyPage(): Promise<void> {
  const { shell } = await import('electron')
  await shell.openExternal(QWEN_API_KEY_DOC_URL)
}

export async function qwenDeviceAuth(): Promise<GithubDeviceAuthResult> {
  return { status: 'error', error: 'Qwen OAuth Device Flow is not supported. Please use API key authentication via Settings > Qwen > Enter API Key.' }
}

export async function qwenPoll(): Promise<GithubDeviceAuthResult> {
  return { status: 'error', error: 'Qwen uses API key authentication. Set your key in Settings.' }
}

// ---------------------------------------------------------------------------
// Google OAuth PKCE Flow
// ---------------------------------------------------------------------------

function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url')
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const hash = createHash('sha256').update(verifier).digest()
  return hash.toString('base64url')
}

export async function googleOAuth(
  start: boolean,
  port = 9876,
): Promise<GoogleOAuthResult> {
  if (!start) {
    if (googleOAuthServer) {
      googleOAuthServer.close()
      googleOAuthServer = null
    }
    if (googleOAuthResolver) {
      googleOAuthResolver({ status: 'error', error: 'OAuth flow cancelled' })
      googleOAuthResolver = null
    }
    googleOAuthState = null
    return { status: 'error', error: 'Flow cancelled' }
  }

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = randomBytes(16).toString('hex')
  const redirectUri = `http://127.0.0.1:${port}/callback`

  const authUrl = new URL(GOOGLE_AUTH_URL)
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)

  googleOAuthState = { codeVerifier, state, redirectUri }

  return new Promise<GoogleOAuthResult>((resolve, reject) => {
    googleOAuthResolver = resolve

    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)

        if (url.pathname === '/callback') {
          await handleGoogleCallback(url, res)
        } else {
          res.writeHead(404)
          res.end('Not found')
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html' })
        res.end(`<h1>Error</h1><p>${err instanceof Error ? err.message : String(err)}</p>`)
        if (googleOAuthResolver) {
          googleOAuthResolver({ status: 'error', error: err instanceof Error ? err.message : String(err) })
        }
        cleanupGoogleOAuth()
      }
    })

    server.listen(port, '127.0.0.1', () => {
      googleOAuthServer = server
      resolve({
        status: 'pending',
        authUrl: authUrl.toString(),
      })
    })

    server.on('error', (err) => {
      reject(err)
      cleanupGoogleOAuth()
    })
  })
}

async function handleGoogleCallback(
  url: URL,
  res: ServerResponse<IncomingMessage>,
): Promise<void> {
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<h1>Authentication cancelled</h1><p>You can close this window.</p>')
    if (googleOAuthResolver) {
      googleOAuthResolver({ status: 'error', error: `OAuth error: ${error}` })
    }
    cleanupGoogleOAuth()
    return
  }

  if (!code || returnedState !== googleOAuthState?.state) {
    res.writeHead(400, { 'Content-Type': 'text/html' })
    res.end('<h1>Invalid callback</h1><p>State mismatch or missing code.</p>')
    if (googleOAuthResolver) {
      googleOAuthResolver({ status: 'error', error: 'Invalid OAuth callback' })
    }
    cleanupGoogleOAuth()
    return
  }

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: googleOAuthState.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: googleOAuthState.codeVerifier,
      }).toString(),
    })

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text()
      res.writeHead(500, { 'Content-Type': 'text/html' })
      res.end(`<h1>Token exchange failed</h1><p>${errText}</p>`)
      if (googleOAuthResolver) {
        googleOAuthResolver({ status: 'error', error: `Token exchange failed: ${errText}` })
      }
      cleanupGoogleOAuth()
      return
    }

    const tokenData = (await tokenResponse.json()) as Record<string, unknown>

    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(
      '<h1>Authentication successful!</h1><p>You can close this window and return to Singularity.</p>',
    )

    if (googleOAuthResolver) {
      googleOAuthResolver({
        status: 'complete',
        tokens: {
          accessToken: String(tokenData.access_token),
          refreshToken: String(tokenData.refresh_token || ''),
        },
      })
    }
    cleanupGoogleOAuth()
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' })
    res.end(`<h1>Error</h1><p>${err instanceof Error ? err.message : String(err)}</p>`)
    if (googleOAuthResolver) {
      googleOAuthResolver({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    }
    cleanupGoogleOAuth()
  }
}

function cleanupGoogleOAuth(): void {
  if (googleOAuthServer) {
    googleOAuthServer.close()
    googleOAuthServer = null
  }
  googleOAuthResolver = null
  googleOAuthState = null
}

// ---------------------------------------------------------------------------
// Google OAuth PKCE Flow with user-provided Client ID
// ---------------------------------------------------------------------------

export async function googleOAuthWithClientId(
  clientId: string,
  start: boolean,
  port = 9876,
): Promise<GoogleOAuthResult> {
  if (!clientId || clientId.includes('your-google-client-id')) {
    return { status: 'error', error: 'Please provide a valid Google Cloud OAuth Client ID.' }
  }

  if (!start) {
    if (googleOAuthServer) { googleOAuthServer.close(); googleOAuthServer = null }
    if (googleOAuthResolver) { googleOAuthResolver({ status: 'error', error: 'Cancelled' }); googleOAuthResolver = null }
    googleOAuthState = null
    return { status: 'error', error: 'Cancelled' }
  }

  const codeVerifier = generateCodeVerifier()
  const codeChallenge = await generateCodeChallenge(codeVerifier)
  const state = randomBytes(16).toString('hex')
  const redirectUri = `http://127.0.0.1:${port}/callback`
  const authUrl = new URL(GOOGLE_AUTH_URL)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', GOOGLE_SCOPES.join(' '))
  authUrl.searchParams.set('code_challenge', codeChallenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  googleOAuthState = { codeVerifier, state, redirectUri }

  return new Promise<GoogleOAuthResult>((resolve, reject) => {
    googleOAuthResolver = resolve
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code')
          const returnedState = url.searchParams.get('state')
          const error = url.searchParams.get('error')
          if (error) { res.writeHead(200, {'Content-Type':'text/html'}); res.end('<h1>Cancelled</h1>'); googleOAuthResolver?.({status:'error', error}); cleanupGoogleOAuth(); return }
          if (!code || returnedState !== googleOAuthState?.state) { res.writeHead(400); res.end('Invalid callback'); googleOAuthResolver?.({status:'error',error:'Invalid callback'}); cleanupGoogleOAuth(); return }
          try {
            const tokenResp = await fetch(GOOGLE_TOKEN_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({ code, client_id: clientId, redirect_uri: googleOAuthState!.redirectUri, grant_type:'authorization_code', code_verifier: googleOAuthState!.codeVerifier }).toString() })
            if (!tokenResp.ok) { const t = await tokenResp.text(); res.writeHead(500,{'Content-Type':'text/html'}); res.end(`<h1>Failed</h1><p>${t}</p>`); googleOAuthResolver?.({status:'error',error:t}); cleanupGoogleOAuth(); return }
            const td = await tokenResp.json() as Record<string,unknown>
            res.writeHead(200,{'Content-Type':'text/html'}); res.end('<h1>Success!</h1><p>Close this window.</p>')
            googleOAuthResolver?.({status:'complete',tokens:{accessToken:String(td.access_token),refreshToken:String(td.refresh_token||'')}})
            cleanupGoogleOAuth()
          } catch(e:any){res.writeHead(500,{'Content-Type':'text/html'});res.end(`<h1>Error</h1><p>${e.message}</p>`);googleOAuthResolver?.({status:'error',error:e.message});cleanupGoogleOAuth()}
        } else { res.writeHead(404); res.end('Not found') }
      } catch(e:any){res.writeHead(500);res.end(e.message);if(googleOAuthResolver)googleOAuthResolver({status:'error',error:e.message});cleanupGoogleOAuth()}
    })
    server.listen(port, '127.0.0.1', () => { googleOAuthServer = server; resolve({status:'pending',authUrl:authUrl.toString()}) })
    server.on('error', (e) => { reject(e); cleanupGoogleOAuth() })
  })
}

// ---------------------------------------------------------------------------
// Gemini API Key Validation
// ---------------------------------------------------------------------------

export async function validateGeminiApiKey(apiKey: string): Promise<{ valid: boolean; models?: string[]; error?: string }> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, { signal: AbortSignal.timeout(8000) })
    if (response.status === 400 || response.status === 403) return { valid: false, error: 'Invalid API key' }
    if (!response.ok) return { valid: false, error: `Validation failed: ${response.status}` }
    const data = await response.json() as { models?: { name: string }[] }
    const models = data.models?.map(m => m.name.replace('models/', '')) || []
    return { valid: true, models }
  } catch (err: any) { return { valid: false, error: err.message } }
}

// ---------------------------------------------------------------------------
// Gemini CLI Credential Import
// ---------------------------------------------------------------------------

export async function importGeminiCliCredentials(): Promise<GeminiImportResult> {
  const credsPath = resolve(homedir(), '.gemini', 'oauth_creds.json')

  if (!existsSync(credsPath)) {
    return {
      success: false,
      error: `Gemini credentials file not found at: ${credsPath}`,
    }
  }

  try {
    const raw = readFileSync(credsPath, 'utf8')
    const creds = JSON.parse(raw) as Record<string, unknown>

    const accessToken =
      (creds.access_token as string) ||
      (creds.token as string) ||
      (creds.accessToken as string)

    const refreshToken =
      (creds.refresh_token as string) ||
      (creds.refreshToken as string) ||
      ''

    if (!accessToken) {
      return {
        success: false,
        error: 'No access token found in Gemini credentials',
      }
    }

    return {
      success: true,
      tokens: { accessToken, refreshToken },
    }
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse Gemini credentials: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
