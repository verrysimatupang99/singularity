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

// Qwen / DashScope OAuth - Device Flow (placeholders)
const QWEN_DEVICE_CODE_URL = 'https://dashscope.aliyuncs.com/oauth/device/code'
const QWEN_TOKEN_URL = 'https://dashscope.aliyuncs.com/oauth/token'
const QWEN_CLIENT_ID = 'your-qwen-client-id'
const QWEN_SCOPE = 'openid profile'

// Google OAuth 2.0 - PKCE Flow
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_CLIENT_ID = 'your-google-client-id.apps.googleusercontent.com'
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
// GitHub Copilot Device Flow
// ---------------------------------------------------------------------------

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
// Qwen Device Flow
// ---------------------------------------------------------------------------

export async function qwenDeviceAuth(): Promise<GithubDeviceAuthResult> {
  try {
    const response = await fetch(QWEN_DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: QWEN_CLIENT_ID,
        scope: QWEN_SCOPE,
      }),
    })

    if (!response.ok) {
      throw new Error(`Qwen device code request failed: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as Record<string, unknown>

    if (data.error) {
      throw new Error(String(data.error_description || data.error))
    }

    return {
      status: 'pending',
      userCode: String(data.user_code || data.verification_code || ''),
      verificationUri: String(data.verification_uri || data.verification_url || ''),
      interval: (data.interval as number) || 5,
    }
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function qwenPoll(): Promise<GithubDeviceAuthResult> {
  try {
    const response = await fetch(QWEN_TOKEN_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: QWEN_CLIENT_ID,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    })

    if (!response.ok) {
      throw new Error(`Qwen token request failed: ${response.status}`)
    }

    const data = (await response.json()) as Record<string, unknown>

    if (data.error === 'authorization_pending' || data.error === 'slow_down') {
      return {
        status: 'pending',
        userCode: '',
        verificationUri: '',
        interval: (data.interval as number) || 5,
      }
    }

    if (data.error) {
      return { status: 'error', error: String(data.error_description || data.error) }
    }

    return { status: 'complete', accessToken: String(data.access_token) }
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) }
  }
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
