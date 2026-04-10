# Singularity — Development Plan

**Date:** 2026-04-10  
**Phase:** 4 — Milestone Plan

---

## M0 — Project Scaffold

**Goal:** Initialize the Electron + TypeScript + React + Vite project with proper tooling.

**Deliverables:**
- `package.json` with all dependencies (Electron 34+, React 19, TypeScript 5.8, Vite 6)
- Vite config for React renderer
- Electron main process entry point
- Electron preload script
- TypeScript configs (main process, renderer, shared)
- ESLint + Prettier configuration
- Basic Electron window opening
- IPC scaffolding with one test channel

**Complexity:** S  
**Depends on:** None  
**Acceptance criteria:** `npm run dev` opens an Electron window with React UI  
**Can parallelize with:** None (foundation for everything)

---

## M1 — Auth: Google/Gemini (OAuth PKCE + Credential Import)

**Goal:** Connect to Google/Gemini via credential import from Gemini CLI OR direct OAuth PKCE.

**Deliverables:**
- Credential import from `~/.gemini/oauth_creds.json` (read, validate, store)
- OAuth PKCE flow as fallback (loopback redirect on 127.0.0.1)
- Gemini API integration using OAuth tokens (endpoint: `cloudcode-pa.googleapis.com/v1internal`)
- Gemini API key auth as alternative
- Provider status indicator in UI (connected/disconnected)
- Unit tests for token validation and refresh

**Complexity:** M  
**Depends on:** M0  
**Acceptance criteria:** Can send/receive messages via Gemini using either imported OAuth creds or API key  
**Can parallelize with:** M8 (UI shell — auth status can be mocked)

---

## M2 — Auth: GitHub Copilot (OAuth Device Flow)

**Goal:** Authenticate with GitHub Copilot via OAuth Device Flow.

**Deliverables:**
- Device code request to `https://github.com/login/oauth/device/code`
- User code display + browser auto-open to `https://github.com/login/device`
- Token polling loop with proper error handling (slow_down, expired_token)
- Token verification via GitHub User API + Copilot internal API
- Copilot Chat API integration
- Unit tests for full device flow (mocked)

**Complexity:** M  
**Depends on:** M0  
**Acceptance criteria:** User can authenticate with GitHub account and send messages via Copilot  
**Can parallelize with:** M1, M3, M8

---

## M3 — Auth: Qwen.ai (OAuth)

**Goal:** Authenticate with Qwen.ai via OAuth Device Flow.

**Deliverables:**
- Qwen device authorization flow implementation
- Credential caching (matching Qwen Code CLI behavior)
- Qwen API integration
- Model selection for Qwen models
- Unit tests (mocked)

**Complexity:** M  
**Depends on:** M0  
**Acceptance criteria:** User can authenticate with Qwen.ai account and send messages  
**Can parallelize with:** M1, M2, M8  

**Note:** OAuth endpoints not publicly documented. May require reverse-engineering Qwen Code CLI or using API key as initial path.

---

## M4 — Auth: API Key Fallback (Anthropic/OpenAI/OpenRouter)

**Goal:** Support API key authentication for providers without OAuth.

**Deliverables:**
- API key input UI in settings
- Key validation via test API call
- Provider integrations:
  - Anthropic (messages API)
  - OpenAI (chat completions)
  - OpenRouter (OpenAI-compatible)
- Per-provider base URL configuration
- Unit tests for each provider

**Complexity:** S  
**Depends on:** M0  
**Acceptance criteria:** User can enter API keys for Anthropic, OpenAI, OpenRouter and send messages  
**Can parallelize with:** M1, M2, M3, M8

---

## M5 — Auth Credential Storage (Electron safeStorage)

**Goal:** Securely store and retrieve all credentials using Electron safeStorage.

**Deliverables:**
- Credential storage service wrapping safeStorage
- Fallback for Linux without keychain (AES-256-GCM with machine-derived key)
- Credential retrieval for API calls
- Token refresh logic (auto-refresh expired OAuth tokens)
- Credential deletion on disconnect
- Settings UI showing stored credentials (masked)
- Integration tests for encrypt/decrypt cycle

**Complexity:** M  
**Depends on:** M1, M2, M3, M4 (need credentials to store)  
**Acceptance criteria:** All credentials encrypted at rest, auto-refresh works, disconnect removes stored data  
**Can parallelize with:** M6, M7

---

## M6 — Provider Abstraction Layer + Gemini Integration

**Goal:** Unified `AIProvider` interface with Gemini as the first fully-integrated provider.

**Deliverables:**
- `AIProvider` TypeScript interface (as defined in ARCHITECTURE.md)
- Provider manager (registry, selection, fallback)
- `ModelInfo` definitions for all supported models
- Gemini provider full implementation (auth + chat + streaming)
- Provider switching in UI
- Unit tests for provider interface contract

**Complexity:** M  
**Depends on:** M1, M5  
**Acceptance criteria:** Can switch between Gemini and another provider in UI, both functional  
**Can parallelize with:** M7, M8

---

## M7 — CLI Wrapper Engine (ACP + spawn + pipe)

**Goal:** Spawn and manage CLI processes using ACP protocol.

**Deliverables:**
- Binary detection service (scan PATH for known CLIs)
- Process spawn with stdio piping
- ACP protocol implementation (JSON-RPC 2.0 types from void's `acpProtocol.ts`)
- CLI session manager (from void's `cliSessionManager.ts`, adapted)
- Initialize/handshake flow
- Session creation and prompt sending
- Streaming output parsing (newline-delimited JSON)
- Process cleanup on termination
- Error classification and user-friendly messages
- Unit tests for ACP message parsing and session lifecycle

**Complexity:** L  
**Depends on:** M0  
**Acceptance criteria:** Can spawn `qwen --acp`, send a prompt, receive streaming response  
**Can parallelize with:** M1-M5, M6, M8

---

## M8 — Core UI Shell (Window, Sidebar, Layout)

**Goal:** Build the Electron app's visual shell with React.

**Deliverables:**
- Main window with title bar
- Sidebar with session list and provider status indicators
- Main content area (placeholder for chat)
- Dark/light theme support
- Responsive layout
- Settings button in sidebar
- Basic navigation between views
- Loading states and error boundaries

**Complexity:** M  
**Depends on:** M0  
**Acceptance criteria:** App looks polished with working sidebar, theme switching, and navigation  
**Can parallelize with:** M1-M7

---

## M9 — Session Management (Create, Restore, Persist)

**Goal:** Save and restore chat sessions with full conversation history.

**Deliverables:**
- Session storage to `~/.config/singularity/sessions/`
- Auto-save on every message (debounced)
- Session list in sidebar with names and timestamps
- Session restore on app restart
- Session deletion
- New session creation
- Per-session provider/model selection
- Unit tests for save/restore cycle

**Complexity:** M  
**Depends on:** M6, M8  
**Acceptance criteria:** Create a session, send messages, close app, reopen — session restored with all messages  
**Can parallelize with:** M7, M10

---

## M10 — Chat Interface + Streaming Renderer

**Goal:** Full chat UI with streaming markdown rendering.

**Deliverables:**
- Message list component (user + assistant messages)
- Streaming text renderer (token-by-token updates)
- Markdown/code block rendering with syntax highlighting
- Copy code button
- Auto-scroll to bottom
- Thinking/reasoning content collapsible
- Error message display
- Cancel request button
- Unit tests for streaming renderer

**Complexity:** M  
**Depends on:** M6, M8  
**Acceptance criteria:** Chat with any provider, streaming renders smoothly, code blocks render with syntax highlighting  
**Can parallelize with:** M7, M9

---

## M11 — MCP Server Manager

**Goal:** Manage Model Context Protocol servers from within the app.

**Deliverables:**
- MCP server configuration UI (command, args, env, cwd)
- Start/stop MCP servers from UI
- Real-time connection status indicators
- Tool discovery from MCP servers
- MCP tools available to AI providers
- Server configuration persistence
- Error handling for crashed servers
- Unit tests for server lifecycle

**Complexity:** M  
**Depends on:** M6, M7  
**Acceptance criteria:** Add an MCP server config, start it, see its tools available in chat  
**Can parallelize with:** M9, M10

---

## M12 — Tool Call Inspector

**Goal:** Dedicated panel for inspecting AI tool calls.

**Deliverables:**
- Tool call list in sidebar/panel
- Expandable tool call details (name, arguments, result)
- Tool call status (pending, executing, completed, failed)
- Permission request UI (allow/deny for tool execution)
- Filter and search tool calls
- Unit tests for tool call state management

**Complexity:** S  
**Depends on:** M7, M10  
**Acceptance criteria:** When AI makes tool calls, they appear in inspector with full details  
**Can parallelize with:** M9, M11

---

## M13 — Settings Page + Provider Connection Management

**Goal:** Settings UI for managing providers, models, and app config.

**Deliverables:**
- Settings page accessible from sidebar
- Provider connection cards with connect/disconnect buttons
- Per-provider model selection dropdown
- API key input for key-based providers
- OAuth credential import status
- Theme selection
- Session management settings (auto-save, max sessions)
- Config file location display
- Import/export settings
- Unit tests for settings persistence

**Complexity:** S  
**Depends on:** M1-M5, M8  
**Acceptance criteria:** Full settings page with all provider connections manageable, settings persist across restarts  
**Can parallelize with:** M9-M12

---

## M14 — Packaging (Linux .deb/.AppImage, macOS .dmg, Windows .exe)

**Goal:** Distributable packages for all three desktop platforms.

**Deliverables:**
- electron-builder configuration
- Linux: .deb and .AppImage packages
- macOS: .dmg with code signing (if certificates available)
- Windows: .exe installer
- Auto-update mechanism (if feasible)
- App icons (use void_icons from void repo as starting point)
- Installation documentation
- Smoke test on each platform

**Complexity:** L  
**Depends on:** M0-M13  
**Acceptance criteria:** Clean install on each platform works, app launches, all providers connectable  
**Can parallelize with:** None

---

## Parallelism Summary

```
M0 ──────────────────────────────────────────────────────────────────────►
     ├─ M1 ── M5 ── M6 ── M9 ──── M10 ──── M12 ── M13 ── M14
     ├─ M2 ───┘          ├─ M11 ─┘              │
     ├─ M3 ───┘          └──────────────────────┘
     ├─ M4 ───┘
     ├─ M7 ──────────────────────────────────────┘
     └─ M8 ──────────────────────────────────────┘

Parallel tracks after M0:
  Track A: M1 → M5 → M6 → M9  → M10 → M12 → M13 → M14
  Track B: M2 → M5  (merge into Track A at M5)
  Track C: M3 → M5  (merge into Track A at M5)
  Track D: M4 → M5  (merge into Track A at M5)
  Track E: M7 → M11 → M12  (merge into Track A at M12)
  Track F: M8 → M9  (merge into Track A at M9)
  Track G: M10 → M12  (merge into Track A at M12)
```

**Maximum parallelism:** M1, M2, M3, M4, M7, M8 can all start after M0.

---

## Recommended First Milestone

**Start with M0 → M8 in parallel with M1.**

M8 (UI Shell) gives you something visual immediately. M1 (Google/Gemini auth) establishes the most-used provider. M0 scaffolds everything. Once M0 is done, M1 and M8 proceed in parallel, converging at M6 (provider abstraction) and M9 (session management).
