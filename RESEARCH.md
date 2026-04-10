# Singularity — Internet Research Synthesis

**Date:** 2026-04-10  
**Phase:** 2 — Internet Deep Research

---

## 2.1 Piebald (gemini-cli-desktop) Authentication Model

### Key Finding: Credential Import, NOT OAuth PKCE

Piebald's authentication works by **importing credentials from existing CLI tools**, not by performing its own OAuth PKCE flow from scratch.

**Mechanism per provider:**

| Provider | Import Source | Mechanism |
|----------|--------------|-----------|
| **Claude Code** | `~/.claude/credentials.json` (Win/Linux) or macOS Keychain | Reads JSON file with access/refresh tokens |
| **Gemini CLI** | Direct sign-in via in-app OAuth (not credential file import) | Browser-based OAuth flow |
| **GitHub Copilot** | Device authorization flow | User enters code from `https://github.com/login/device` |
| **Qwen** | Direct sign-in | OAuth device flow |
| **API Key providers** | User input | Plain text API key entry |

**Important:** Piebald is built with **Tauri + Rust** (not Electron). Its frontend is React + TypeScript with Tailwind CSS.

**Token management:**
- OAuth providers expose access and refresh tokens for viewing/editing in settings
- Automatic token refresh is implemented
- Expired tokens trigger inline "Re-authenticate" prompts

### Credential File Locations (Confirmed)

| Tool | Credential Path | Format |
|------|----------------|--------|
| Claude Code | `~/.claude/credentials.json` | JSON with access_token |
| Gemini CLI | `~/.gemini/oauth_creds.json` | JSON with access_token, refresh_token, scope, expiry_date |
| GitHub Copilot CLI | `~/.claude-copilot-auth.json` (third-party tools) | JSON with access_token, github_user, created_at |

**Conclusion for Singularity:** The most reliable approach is a **hybrid model**:
1. For Gemini: Read from `~/.gemini/oauth_creds.json` if it exists (user already logged into Gemini CLI), OR perform OAuth PKCE directly
2. For GitHub Copilot: OAuth Device Flow (standard, well-documented)
3. For Qwen.ai: OAuth Device Flow (same as Qwen Code's built-in flow)
4. For Anthropic/OpenAI/OpenRouter: API key input

---

## 2.2 AionUI — CLI Wrapping via ACP Protocol

### Architecture Summary

AionUI wraps external CLI tools (Claude Code, Qwen Code, Gemini CLI, Copilot CLI, etc.) using the **Agent Client Protocol (ACP)**.

**Communication:** JSON-RPC 2.0 over stdio (stdin/stdout). No network layer needed.

**Supported CLI tools (ACP-compliant):**
- Claude Code (`claude`)
- Qwen Code (`qwen --acp`)
- GitHub Copilot (`copilot --acp --stdio`)
- Gemini CLI (built-in, non-ACP native integration)
- Goose (`goose acp`)
- OpenClaw (`openclaw`)
- Kimi (`kimi`)
- And 10+ more

**CLI launch flags per tool:**
```
claude              # defaults to stdio ACP
qwen --acp          # explicit ACP flag
copilot --acp --stdio   # requires both flags
goose acp           # subcommand for ACP
```

**Process Lifecycle:**
1. **Detection:** Auto-scan system PATH on launch
2. **Spawn:** child_process.spawn() with stdio: ['pipe', 'pipe', 'pipe']
3. **Initialize:** JSON-RPC handshake (protocol version + capabilities)
4. **Authenticate:** If needed, send OAuth credentials
5. **Session:** Create session with cwd context
6. **Prompt:** Send user messages, receive streaming updates
7. **Cleanup:** Graceful termination on disconnect

**Key reliability measures:**
- Validate CLI binary exists before spawn (prevent ENOENT crash)
- Auto-reconnect on dropped/timed-out sessions
- Permission prompts for file access operations

---

## 2.3 ACP Protocol Specification

### Communication Model

- **Transport:** stdio (stdin/stdout of child process)
- **Protocol:** JSON-RPC 2.0
- **Framing:** One JSON object per line (newline-delimited)

### Message Types

1. **Request-Response** (expects reply):
   - `initialize` → `{ protocolVersion, authMethods, agentCapabilities }`
   - `session/new { cwd }` → `{ sessionId }`
   - `session/prompt { sessionId, prompt }` → streaming updates
   - `session/request_permission { requestId, toolCall, options }` → `{ selectedOptionId }`

2. **Notifications** (fire-and-forget, used for streaming):
   - `session/update` with types:
     - `agent_message_chunk` — text content streaming
     - `agent_thought_chunk` — reasoning/thinking content
     - `tool_call` — tool execution request
     - `tool_call_update` — tool result
     - `end_turn` — turn complete
     - `error` — error occurred

### Protocol Flow
```
Client → CLI: initialize { protocolVersion: "2025-03-27", ... }
CLI → Client: { protocolVersion, authMethods: [...], agentCapabilities: {...} }

Client → CLI: authenticate { method: "api-key", token: "..." }  // if needed
CLI → Client: { status: "authenticated" }

Client → CLI: session/new { cwd: "/path/to/project" }
CLI → Client: { sessionId: "uuid-..." }

Client → CLI: session/prompt { sessionId, prompt: [{type: "text", text: "..."}] }
CLI → Client: session/update (streaming chunks)
Client → CLI: session/request_permission response (for tool calls)
CLI → Client: session/update { type: "end_turn", stopReason: "end_turn" }
```

---

## 2.4 GitHub Copilot OAuth Device Flow

### Endpoints
- **Device Code:** `POST https://github.com/login/oauth/device/code`
- **Token Poll:** `POST https://github.com/login/oauth/access_token`
- **User Verification:** `GET https://api.github.com/user`
- **Copilot Access Verification:** `GET https://api.github.com/copilot_internal/user`

### Required Scopes
- `read:user` (minimum)

### Complete Flow
1. POST to `/login/oauth/device/code` with `client_id` and `scope`
2. Receive `device_code`, `user_code`, `verification_uri`, `expires_in`, `interval`
3. Display `verification_uri` + `user_code` to user (auto-open browser)
4. Poll `/login/oauth/access_token` every `interval` seconds with:
   ```
   { client_id, device_code, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }
   ```
5. Responses: `authorization_pending` (keep polling), `slow_down` (wait 5s), `expired_token`, `access_denied`, or `access_token`
6. Verify token against GitHub User API
7. Store token securely

### Token Storage
- Third-party tools store in `~/.claude-copilot-auth.json`
- For Singularity: use Electron safeStorage

---

## 2.5 Google OAuth 2.0 / Gemini

### Gemini CLI OAuth Token Storage

**File:** `~/.gemini/oauth_creds.json`

**JSON Structure:**
```json
{
  "access_token": "ya29.a0A...",
  "refresh_token": "1//03D...",
  "scope": "https://www.googleapis.com/auth/cloud-platform",
  "token_type": "Bearer",
  "expires_in": 3599,
  "expiry_date": 1712345678000
}
```

### API Endpoints (CRITICAL DIFFERENCE)
| Auth Method | Endpoint |
|-------------|----------|
| API Key | `https://generativelanguage.googleapis.com/v1beta` |
| OAuth (CLI creds) | `https://cloudcode-pa.googleapis.com/v1internal` |

**OAuth tokens must be used with the internal endpoint**, not the public API. This is a common source of errors.

### OAuth PKCE for Desktop (if building own flow)
- Use loopback redirect: `http://127.0.0.1:PORT/callback`
- Application type: "Desktop app" in Google Cloud Console
- PKCE required (code_challenge, code_challenge_method: S256)
- Scope: `https://www.googleapis.com/auth/cloud-platform` or Gemini-specific scopes

---

## 2.6 Electron safeStorage on Linux

### Behavior
- Linux requires a secret storage backend: `kwallet`, `kwallet5`, `kwallet6`, or `gnome-libsecret`
- The backend is auto-detected based on window manager and system settings
- Can be forced via CLI flag: `electron --password-store=gnome-libsecret`

### Fallback Strategy
When no keychain is available:
1. `safeStorage.isEncryptionAvailable()` returns `false`
2. **Fallback:** Store encrypted with a derived key from a machine-specific identifier (less secure)
3. **Alternative:** Store as plaintext in `~/.config/singularity/` with a warning to the user

### Encryption Details
- `safeStorage.encryptString(plainText)` → `Buffer` (hex string for storage)
- `safeStorage.decryptString(buffer)` → `string`
- The encryption key is managed by the OS keychain — app doesn't handle it directly

### Recommendation for Singularity
1. Try `safeStorage.encryptString()` first
2. If unavailable (headless Linux, no keychain daemon), fall back to AES-256-GCM with a key derived from machine ID + app secret
3. Store tokens as hex-encoded buffers in `~/.config/singularity/credentials.json`

---

## 2.7 Qwen.ai OAuth

### Auth Methods
1. **Qwen OAuth (Free):** Device flow via qwen.ai account. Free tier with quotas (60 req/min, 1,000 req/day)
2. **Alibaba Cloud Coding Plan (Paid):** API key (`sk-sp-...`) with higher quotas
3. **API Key (Third-party):** OpenAI-compatible, Anthropic, or Google GenAI protocols via env vars

### Device Flow
- Browser-based login on first CLI run (`qwen`)
- Credentials cached locally after successful login
- Not supported in non-interactive/headless environments

### settings.json Model Provider Format
```json
{
  "modelProviders": {
    "openai": [{ "id": "gpt-4o", "envKey": "OPENAI_API_KEY", "baseUrl": "https://api.openai.com/v1" }],
    "anthropic": [{ "id": "claude-sonnet-4-20250514", "envKey": "ANTHROPIC_API_KEY" }],
    "gemini": [{ "id": "gemini-2.5-pro", "envKey": "GEMINI_API_KEY" }]
  }
}
```

**Note:** API keys are NOT stored in settings.json. They use environment variables or `.qwen/.env` files.

---

## Open Questions

1. **Piebald's exact OAuth client ID** for Google — is it using Gemini CLI's embedded client or its own registered OAuth app? (Unclear from docs)
2. **Qwen.ai OAuth device flow endpoints** — specific token/authorization URLs not documented publicly
3. **GitHub Copilot's official client_id** for device flow — the official `gh copilot` CLI uses GitHub's own client_id, but third-party tools may need to register their own
4. **Token refresh for Gemini OAuth** — the `~/.gemini/oauth_creds.json` has `refresh_token` but the refresh endpoint URL and client_id needed are not publicly documented (likely uses Gemini CLI's embedded client)

---

## Confidence Assessment

| Topic | Confidence | Evidence |
|-------|-----------|----------|
| Piebald credential import mechanism | High | Piebald changelog, Mintlify docs |
| Gemini CLI OAuth token format | High | Multiple GitHub issues confirm format |
| Gemini OAuth API endpoint difference | High | zeroclaw wiki confirms separate endpoints |
| GitHub Copilot device flow | High | Multiple implementations found |
| ACP protocol spec | Medium-High | AionUi wiki + cnblogs analysis |
| Electron safeStorage Linux behavior | High | Official Electron docs |
| Qwen Code settings.json format | High | Official docs |
| Qwen.ai OAuth endpoints | Low | Not publicly documented |
