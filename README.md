# Singularity

> A lightweight desktop IDE that brings multi-provider AI coding agents into one unified interface.

[![CI](https://github.com/verrysimatupang99/singularity/actions/workflows/ci.yml/badge.svg)](https://github.com/verrysimatupang99/singularity/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-green)](https://nodejs.org)

## What is Singularity?

Singularity is a **standalone Electron + TypeScript + React** desktop app that lets you:

- **Chat with multiple AI providers** in one unified interface
- **Use your existing subscriptions** — no Singularity account required (Piebald-style)
- **Wrap CLI tools** (Gemini CLI, Claude Code, Qwen Code) via ACP protocol
- **Manage MCP servers** and inspect tool calls in real-time
- **Store credentials locally** — no backend, no data collection

## Supported Providers

| Provider | Auth | Status |
|---|---|---|
| Anthropic Claude | API Key | ✅ Ready |
| OpenAI | API Key | ✅ Ready |
| OpenRouter | API Key | ✅ Ready |
| Google Gemini | API Key / Credential Import | ✅ Ready |
| GitHub Copilot | OAuth Device Flow | ✅ Ready |
| Gemini CLI | CLI wrapper (ACP) | ✅ Ready |
| Claude Code | CLI wrapper (ACP) | ✅ Ready |
| Qwen Code | CLI wrapper (ACP) | ✅ Ready |
| Qwen.ai | API Key / OAuth (planned) | 🔧 API Key Ready |

## Quick Start

```bash
git clone https://github.com/verrysimatupang99/singularity.git
cd singularity
npm install
npm run dev
```

**Requirements:** Node.js ≥ 20, npm ≥ 10

## Development

```bash
npm run dev              # Start with hot reload
npm test                 # Run 199 unit tests
npm run test:coverage    # Coverage report
npm run typecheck        # TypeScript check
npm run package          # Build distributable (.deb, .AppImage, .dmg, .exe)
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Main Process                  │
│  ┌──────────┐  ┌───────────┐  ┌──────────────┐  │
│  │ Providers│  │ Services  │  │ IPC Handlers │  │
│  │ (8+)     │  │ storage,  │  │ chat, auth,  │  │
│  │          │  │ oauth,    │  │ sessions,    │  │
│  │          │  │ CLI, MCP  │  │ mcp, cli     │  │
│  └──────────┘  └───────────┘  └──────────────┘  │
└──────────────────────┬──────────────────────────┘
                       │ IPC (contextBridge)
┌──────────────────────┴──────────────────────────┐
│               Renderer (React 19)               │
│  ┌──────────┐ ┌──────────┐ ┌─────────────────┐  │
│  │ Sidebar  │ │  Chat    │ │  Settings       │  │
│  │ Sessions │ │  UI      │ │  + Connections  │  │
│  └──────────┘ └──────────┘ └─────────────────┘  │
│  ┌──────────────────────────────────────────┐   │
│  │  Tool Call Inspector Panel               │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

- **Main process** (`src/main/`) — providers, services, IPC handlers
- **Renderer** (`src/renderer/`) — React UI, chat interface
- **Preload** (`src/preload/`) — IPC bridge (contextBridge)
- **Providers** (`src/main/providers/`) — AIProvider interface + implementations

See [ARCHITECTURE.md](ARCHITECTURE.md) for full ADR.

## Features

### Multi-Provider Chat
Switch between providers per session. Each provider implements the `AIProvider` interface with streaming, cancellation, and error handling.

### CLI Wrapping (ACP Protocol)
Spawn external AI CLIs (Gemini CLI, Claude Code, Qwen Code) and communicate via the Agent Client Protocol — JSON-RPC 2.0 over stdio.

### Credential Management
- **API keys** stored encrypted via Electron safeStorage
- **AES-256-GCM fallback** for Linux without keyring
- **OAuth credential import** from Gemini CLI (`~/.gemini/oauth_creds.json`)
- **GitHub Copilot** via OAuth Device Flow (browser → device code → polling)

### Session Persistence
Sessions auto-save to `~/.config/singularity/sessions/` and restore on app restart.

### MCP Server Manager
Add, start, stop MCP servers from Settings. Discover and use tools from running servers.

### Tool Call Inspector
View all tool calls from CLI sessions with filter, search, and expandable arguments/results.

## Project Structure

```
src/
├── main/
│   ├── index.ts                    # Electron main process + IPC handlers
│   ├── providers/
│   │   ├── types.ts                # AIProvider interface + error types
│   │   ├── registry.ts             # ProviderRegistry singleton
│   │   ├── index.ts                # initProviders()
│   │   ├── anthropic.ts            # AnthropicProvider
│   │   ├── openai-compatible.ts    # Base class for OpenAI-compatible
│   │   ├── openai.ts               # OpenAIProvider
│   │   ├── openrouter.ts           # OpenRouterProvider
│   │   ├── gemini.ts               # GeminiProvider (API key + OAuth import)
│   │   ├── github-copilot.ts       # GitHubCopilotProvider (device flow)
│   │   ├── cli-provider-factory.ts # Factory for CLI-based providers
│   │   ├── cli-gemini.ts           # GeminiCLIProvider
│   │   ├── cli-claude.ts           # ClaudeCLIProvider
│   │   └── cli-qwen.ts             # QwenCLIProvider
│   └── services/
│       ├── storage.ts              # safeStorage + AES-256-GCM fallback
│       ├── oauthService.ts         # OAuth device flows (GitHub, Qwen, Google)
│       ├── cliSessionManager.ts    # ACP protocol CLI wrapper
│       └── mcpManager.ts           # MCP server lifecycle manager
├── renderer/
│   ├── App.tsx                     # App shell + session management
│   ├── types.ts                    # Shared types + window API
│   ├── main.tsx                    # React entry point
│   └── components/
│       ├── Sidebar.tsx             # Session list + provider status
│       ├── ChatView.tsx            # Chat UI + streaming
│       ├── MessageBubble.tsx       # Markdown + code blocks
│       ├── SettingsView.tsx        # Provider connections + MCP
│       └── ToolCallInspector.tsx   # Tool call panel
├── preload/
│   └── index.ts                    # IPC bridge (contextBridge)
└── test/
    ├── mocks/electron.ts           # Electron API mocks
    ├── smoke.test.ts               # Baseline test
    ├── providers/                  # Provider unit tests (85+ tests)
    └── services/                   # Service unit tests
```

## Troubleshooting

### /dev/shm permission error saat launch di Linux

Jalankan sekali:

```bash
sudo chmod 1777 /dev/shm
```

Ini dibutuhkan Chromium untuk shared memory IPC.

### App tidak launch setelah install di beberapa distro

Coba:

```bash
singularity --no-sandbox
```

### Auto-updater menampilkan error saat pertama launch

Ini non-fatal dan tidak mempengaruhi fungsi app. Terjadi jika belum ada
release assets di GitHub Releases. App tetap berjalan normal.

## License

MIT © 2026 Singularity Contributors
