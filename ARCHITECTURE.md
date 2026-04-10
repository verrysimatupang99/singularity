# Singularity — Architecture Decision Record (ADR)

**Date:** 2026-04-10  
**Phase:** 3 — Architecture Decisions

---

## 3.1 AUTH MODEL

### Decision: Hybrid Credential Import + Direct OAuth

**Evidence:** From Phase 2 research, Piebald imports credentials from `~/.claude/credentials.json` and performs direct OAuth for other providers. Gemini CLI stores OAuth tokens in `~/.gemini/oauth_creds.json`.

### Per-Provider Auth Flows

#### Google/Gemini — Dual-Path
```
Path A (Credential Import):
  User has Gemini CLI installed + logged in →
  Singularity reads ~/.gemini/oauth_creds.json →
  Validates access_token against https://cloudcode-pa.googleapis.com/v1internal →
  Stores tokens via safeStorage → done

Path B (Direct OAuth PKCE):
  User clicks "Connect Google" →
  Electron opens browser → accounts.google.com/o/oauth2/v2/auth
  [params: client_id, redirect_uri=http://127.0.0.1:PORT/callback,
   scope=https://www.googleapis.com/auth/cloud-platform,
   code_challenge=S256, response_type=code] →
  User logs in → callback received → exchange code for tokens →
  Store with safeStorage → done
```

**API Endpoint:** OAuth tokens use `https://cloudcode-pa.googleapis.com/v1internal` (NOT the public API).

#### GitHub/Copilot — OAuth Device Flow
```
User clicks "Connect GitHub" →
  Singularity POSTs https://github.com/login/oauth/device/code
  [params: client_id, scope=read:user] →
  Receives { device_code, user_code, verification_uri, interval } →
  Opens browser to verification_uri with user_code →
  Polls https://github.com/login/oauth/access_token with device_code →
  Receives access_token →
  Verifies via GET https://api.github.com/user + /copilot_internal/user →
  Stores token via safeStorage → done
```

#### Qwen.ai — OAuth Device Flow
```
User clicks "Connect Qwen" →
  Initiates Qwen device authorization flow (browser-based) →
  User logs into qwen.ai account →
  Credentials cached locally (same as Qwen Code CLI) →
  Singularity reads cached credentials →
  Stores via safeStorage → done
```

#### Anthropic/OpenAI/OpenRouter — API Key
```
User clicks "Add API Key" →
  Enters key in settings UI →
  Validated with a test API call →
  Stored via safeStorage → done
```

---

## 3.2 PROCESS MODEL

### Architecture: Electron Main + Renderer(s)

```
┌─────────────────────────────────────────────────┐
│                   Main Process                  │
│                                                 │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │  IPC Router  │  │   Provider Manager       │  │
│  │  (channels)  │──│   (auth + API routing)   │  │
│  └──────┬──────┘  └──────────────────────────┘  │
│         │         ┌──────────────────────────┐  │
│  ┌──────┴──────┐  │   CLI Session Manager    │  │
│  │ safeStorage  │  │   (ACP protocol + spawn) │  │
│  │ (encryption) │  └──────────────────────────┘  │
│  └─────────────┘  ┌──────────────────────────┐  │
│                   │   MCP Server Manager       │  │
│                   │   (MCP stdio connections)  │  │
│                   └──────────────────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │ IPC (preload)
┌──────────────────────┴──────────────────────────┐
│               Renderer Process (React)           │
│                                                 │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │ Sidebar   │ │  Chat    │ │  Settings Page  │  │
│  │ + Sessions│ │  UI      │ │  + Connections  │  │
│  └──────────┘ └──────────┘ └─────────────────┘  │
│  ┌──────────────────────────────────────────┐   │
│  │  Tool Call Inspector Panel               │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### IPC Channel Names

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `auth:connect` | renderer → main | Initiate auth flow for a provider |
| `auth:disconnect` | renderer → main | Revoke/remove credentials |
| `auth:status` | renderer → main | Check connection status |
| `auth:status:update` | main → renderer | Push auth status changes |
| `chat:send` | renderer → main | Send message to provider |
| `chat:stream` | main → renderer | Stream response chunks |
| `chat:cancel` | renderer → main | Cancel in-progress request |
| `chat:history` | renderer → main | Load session history |
| `sessions:list` | renderer → main | List all sessions |
| `sessions:create` | renderer → main | Create new session |
| `sessions:delete` | renderer → main | Delete a session |
| `sessions:restore` | renderer → main | Restore session state |
| `cli:spawn` | renderer → main | Start CLI session |
| `cli:prompt` | renderer → main | Send prompt to CLI |
| `cli:stream` | main → renderer | Stream CLI output |
| `cli:terminate` | renderer → main | End CLI session |
| `cli:permission` | main → renderer | Request tool call permission |
| `cli:permission:reply` | renderer → main | Grant/deny permission |
| `mcp:list` | renderer → main | List MCP servers |
| `mcp:start` | renderer → main | Start MCP server |
| `mcp:stop` | renderer → main | Stop MCP server |
| `mcp:tools` | renderer → main | List available MCP tools |
| `settings:get` | renderer → main | Get app settings |
| `settings:set` | renderer → main | Update app settings |
| `storage:encrypt` | renderer → main | Encrypt and store credential |
| `storage:decrypt` | renderer → main | Decrypt stored credential |

---

## 3.3 CLI WRAPPING STRATEGY

**Evidence:** From Phase 2 research (AionUI, ACP protocol spec) and Phase 1 (void's `cliSessionManager.ts`).

### Binary Detection
```typescript
// Scan PATH for known CLI binaries
async function detectCliBinaries(): Promise<Record<string, string>> {
  const binaries: Record<string, string[]> = {
    'gemini-cli': ['gemini', 'gemini-cli'],
    'claude-code': ['claude'],
    'qwen-code': ['qwen', 'qwen-code'],
    'copilot-cli': ['copilot', 'gh-copilot'],
  };
  // Use `which`/`where` to find in PATH
}
```

### Spawn Options
```typescript
const child = spawn(binary, acpFlags, {
  stdio: ['pipe', 'pipe', 'pipe'],  // stdin, stdout, stderr all piped
  cwd: projectDirectory,
  env: { ...process.env, ...providerEnvVars },
  shell: false,  // Never use shell for ACP communication
});
```

### ACP Flags per CLI
| CLI | ACP Launch Command |
|-----|-------------------|
| Claude Code | `claude` (defaults to stdio) |
| Qwen Code | `qwen --acp` |
| GitHub Copilot | `copilot --acp --stdio` |
| Gemini CLI | Native (non-ACP, uses direct API) |

### Pipe Protocol
- Newline-delimited JSON on stdout
- Each line is a complete JSON-RPC 2.0 message
- stdin used for sending requests/notifications to CLI
- stderr captured for error logging (not parsed as protocol)

### Process Lifecycle
1. **Pre-flight:** Validate binary exists, prepare environment (clean env vars per void's `envUtils.ts`)
2. **Spawn:** `child_process.spawn()` with piped stdio
3. **Initialize:** Send `initialize` JSON-RPC request, wait for capabilities response
4. **Authenticate:** If required, send credentials via `authenticate` request
5. **Session:** Create session via `session/new`, receive sessionId
6. **Active:** Send prompts, receive streaming updates, handle permission requests
7. **Terminate:** Send graceful shutdown, wait for process exit, kill after timeout

---

## 3.4 PROVIDER INTERFACE

```typescript
/**
 * Unified provider interface for all AI providers.
 * Each provider implementation handles its own auth method
 * (OAuth, API key, credential import) and API protocol.
 */
interface AIProvider {
  /** Unique provider identifier */
  readonly id: string;  // e.g., "gemini", "github-copilot", "anthropic"

  /** Human-readable name */
  readonly name: string;  // e.g., "Google Gemini", "GitHub Copilot"

  /** Supported authentication methods */
  readonly authMethods: AuthMethod[];  // ['oauth-import', 'oauth-pkce', 'device-flow', 'api-key']

  /** Check if this provider is available (binary found, credentials valid) */
  isAvailable(): Promise<boolean>;

  /** Get list of available models for this provider */
  getModels(): Promise<ModelInfo[]>;

  /** Send a chat message and receive streaming response */
  chat(
    messages: ChatMessage[],
    options: ChatOptions,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<ChatResponse>;

  /** Cancel an in-progress chat request */
  cancel(requestId: string): void;

  /** Spawn a CLI-based session (for CLI providers) */
  spawnSession?(cwd: string): Promise<CLISession>;
}

interface AuthMethod {
  type: 'oauth-import' | 'oauth-pkce' | 'device-flow' | 'api-key';
  label: string;
  description: string;
}

interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
  maxOutputTokens: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsReasoning: boolean;
  pricing?: { inputPerToken: number; outputPerToken: number };
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentBlock[];
}

interface StreamChunk {
  type: 'text' | 'thought' | 'tool_call' | 'tool_result';
  content: string;
  toolCall?: ToolCall;
}

interface CLISession {
  sessionId: string;
  sendPrompt(prompt: string): void;
  onStream: Event<StreamChunk>;
  onPermissionRequest: Event<PermissionRequest>;
  grantPermission(requestId: string, allowed: boolean): void;
  terminate(): Promise<void>;
}
```

---

## 3.5 STATE & PERSISTENCE

### Config File Location
```
Linux:   ~/.config/singularity/
macOS:   ~/Library/Application Support/singularity/
Windows: %APPDATA%/singularity/
```

### File Structure
```
~/.config/singularity/
├── settings.json          # User settings (provider config, UI preferences)
├── credentials.enc.json   # Encrypted credentials (via safeStorage)
├── sessions/
│   ├── <session-id>.json  # Per-session conversation history
│   └── ...
├── cli-cache/
│   └── binary-detection.json  # Cached binary detection results
└── mcp-servers/
    └── <server-name>.json  # MCP server configurations
```

### Settings Schema (inspired by Qwen Code)
```json
{
  "providers": {
    "gemini": {
      "authMethod": "oauth-import",
      "models": [{ "id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro" }]
    },
    "github-copilot": {
      "authMethod": "device-flow",
      "models": [{ "id": "gpt-4o", "name": "GPT-4o (Copilot)" }]
    },
    "anthropic": {
      "authMethod": "api-key",
      "apiKey": "<stored-in-credentials-file>"
    }
  },
  "general": {
    "theme": "dark",
    "defaultModel": "gemini-2.5-pro",
    "autoSaveSessions": true
  }
}
```

### Session Storage
- Sessions stored as JSON in `~/.config/singularity/sessions/`
- Each session contains: id, name, createdAt, updatedAt, provider, model, messages[], cliSessionId?
- Auto-save on every message (debounced to 5s)
- Session list/index in memory for fast sidebar display

---

## 3.6 SECURITY MODEL

### Token Storage
- All tokens encrypted via `electron.safeStorage.encryptString()`
- Stored in `credentials.enc.json` as hex-encoded buffer
- Credentials file readable only by current OS user

### Token Rotation
- OAuth access tokens have expiry (typically 1 hour)
- Refresh tokens are long-lived
- On 401 response, attempt token refresh
- If refresh fails, prompt user to re-authenticate

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Token theft from disk | safeStorage encryption (OS keychain-backed) |
| Memory scraping | Tokens held in memory only during active session |
| MITM on API calls | HTTPS enforced, certificate pinning optional |
| Credential injection | Validate credential file ownership + permissions |
| Keychain unavailable | Fallback to AES-256-GCM with machine-derived key |
| CLI binary trojaning | Warn on first spawn, show full binary path in settings |

### Credential Expiry Handling
```
Token expires → API returns 401 →
  Attempt refresh (if OAuth) →
    Success: Update stored credentials, retry request
    Failure: Mark provider as disconnected, show re-auth prompt
```

---

## Open Questions (Unresolved)

1. **Qwen.ai OAuth endpoints** — Not publicly documented. Need to reverse-engineer from Qwen Code CLI or contact Qwen team.
2. **Gemini OAuth refresh token endpoint** — The client_id needed for refreshing `~/.gemini/oauth_creds.json` tokens is embedded in Gemini CLI. May need to use Gemini CLI's embedded client or register our own.
3. **GitHub Copilot client_id** — The official `gh copilot` uses GitHub's first-party client_id. Third-party apps may need their own OAuth app registration.
4. **SafeStorage on headless Linux** — Some Linux setups (Wayland-only, no keyring daemon) have no available secret store. Need graceful degradation path.
