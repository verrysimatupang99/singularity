# Changelog

## [1.0.0-hotfix] — 2026-04-10

### Fixed
- fix(packaging): externalize node-pty, fix CJS default import, remove circular chunk (3fa7c40)
- fix(runtime): electron-updater CJS interop — use default import (0a4c76d)
- fix(updater): HTTP 406 guard — skip check when no release assets exist (24b26aa)
- fix(main): replace require() with ESM import in storage.ts (33448fe)
- fix(security): remove explicit sandbox:false from secondary window (33448fe)
- fix(build): convert OpenAI dynamic imports to static imports (33448fe)

### Security
- fix(security): add Content-Security-Policy headers via session.webRequest
- fix(security): add IPC input validation (path traversal, shell injection, string length)
- feat(security): add logRendererError IPC channel for crash telemetry

### Added
- feat(ci): add GitHub Actions release workflow triggered on v* tags
- docs: add troubleshooting section to README

## [1.0.0] — 2026-04-10

### Added
- **10 AI providers**: Claude, GPT-4o, Gemini, Copilot, OpenRouter, Qwen, Gemini CLI, Claude Code, Qwen Code, CLI wrappers
- **176 tests** across 23 test files (zero TypeScript errors)
- **Full IDE**: Monaco editor, file tree, integrated terminal, git diff viewer
- **Agent mode**: tools (read/write file, terminal, search, memory), parallel orchestration via sub-agents
- **MCP Server Manager**: JSON-RPC 2.0, auto-restart, tool discovery, chat integration
- **Computer Use (CUA)**: screenshot, click, type — agent-driven automation
- **Plugin Marketplace**: SHA-256 verified remote install from registry
- **Token Usage Dashboard** with cost estimation and context compression
- **Onboarding wizard**: first-run setup with provider configuration
- **Crash safety**: ErrorBoundary per panel, crash report persistence
- **Auto-updater** via GitHub Releases (electron-updater)
- **Packages**: .deb, .AppImage (Linux), .dmg (macOS), .exe (Windows)
- **CI/CD**: GitHub Actions (lint + test on every push)

### Technical
- Electron 35 + React 19 + Vite 6 + TypeScript 5.8 (strict mode)
- AES-256-GCM credential encryption via Electron safeStorage
- ACP protocol for CLI integration (JSON-RPC 2.0 over stdio)
- Streaming SSE + Anthropic event streaming + Gemini REST
- OAuth: GitHub Copilot Device Flow, Google PKCE, API key fallback
- Session persistence, export (Markdown/JSON), virtualized message lists

### Security
- No Singularity account required — bring your own subscriptions
- Credentials stored locally with OS keychain encryption
- Plugin SHA-256 verification for safe installation
- Agent tool approval system (write/terminal require consent)
