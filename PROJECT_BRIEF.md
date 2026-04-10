# Singularity — Project Brief

**One-page summary for stakeholders and contributors**

---

## What is Singularity?

Singularity is a **standalone desktop app** (Electron + TypeScript + React) that brings **multi-provider AI coding agents** into a single, unified interface. Inspired by Piebald, AionUI, and Qwen Code.

## For Whom?

**Programmers** who want a programmer-first coding assistant with:
- Parallel agent sessions across different AI providers
- Bring-your-own-subscription model (no Singularity account needed)
- CLI tool integration (Gemini CLI, Claude Code, Qwen Code, Copilot CLI)
- Tool call inspection and MCP server management
- Session persistence and per-session configuration

## Key Constraints

| Constraint | Detail |
|------------|--------|
| **Login model** | Users bring their own existing subscriptions. Singularity does NOT sell accounts, has no pro tier, and has no backend. |
| **Not a VS Code fork** | Standalone Electron app from scratch (not building on Void/VS Code) |
| **Open source** | MIT licensed |
| **No vendor lock-in** | Any provider can be swapped at any time |
| **Privacy-first** | Credentials stored locally, never transmitted to Singularity servers (there are none) |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Electron 34 + TypeScript + React 19 |
| **Build** | Vite 6 + electron-builder |
| **CLI Protocol** | ACP (Agent Client Protocol) — JSON-RPC 2.0 over stdio |
| **Credential Storage** | Electron safeStorage (OS keychain-backed) |
| **Markdown Rendering** | marked + highlight.js |
| **Icons** | Lucide React |

## Provider Support Matrix

| Provider | Auth Method | Models | Status |
|----------|------------|--------|--------|
| **Google/Gemini** | OAuth credential import + PKCE fallback | Gemini 2.5 Pro, Flash, etc. | Planned |
| **GitHub/Copilot** | OAuth Device Flow | GPT-4o, Claude Sonnet (via Copilot) | Planned |
| **Qwen.ai** | OAuth Device Flow | Qwen Coder, Qwen Max | Planned |
| **Anthropic** | API Key | Claude Sonnet, Opus, Haiku | Planned |
| **OpenAI** | API Key | GPT-4o, o3, o4-mini | Planned |
| **OpenRouter** | API Key | Any model via OpenRouter | Planned |
| **CLI Wrappers** | ACP protocol (stdio) | Gemini CLI, Claude Code, Qwen Code, Copilot CLI | Planned |

## Login Model (Piebald-style)

```
┌─────────────────────────────────────────────────┐
│  User has existing subscriptions:               │
│  ✓ Google AI Pro    ✓ GitHub Copilot            │
│  ✓ Claude Pro       ✓ Qwen Free                 │
│                                                 │
│  Singularity imports credentials:               │
│  • Gemini: reads ~/.gemini/oauth_creds.json     │
│  • Copilot: OAuth Device Flow                   │
│  • Qwen: OAuth Device Flow                      │
│  • Anthropic/OpenAI: API key input              │
│                                                 │
│  No Singularity account. No backend.            │
│  No subscription. No data collection.           │
└─────────────────────────────────────────────────┘
```

## Recommended First Milestone

**M0 (Project Scaffold) → M8 (UI Shell) + M1 (Google/Gemini Auth) in parallel.**

This gives a visual prototype (M8) with a working provider (M1) as fast as possible. The UI shell provides the canvas, and Gemini auth establishes the most commonly used provider. Once M0 scaffolding is done, M1 and M8 proceed independently.

## Current Status

**Phase 0-5 (Planning) complete.** Ready to begin implementation at M0.

All planning artifacts:
- `agent.md` — Working document
- `ARCHITECTURE.md` — Full ADR
- `DEVELOPMENT_PLAN.md` — 15-milestone plan
- `RESEARCH.md` — Internet research synthesis
- `VOID_ARCHAEOLOGY.md` — Codebase archaeology of ~/Documents/Coding/void
- `package.json` — Scaffold with all required dependencies
