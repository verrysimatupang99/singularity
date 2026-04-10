# Singularity — Agent Working Document

## Status
- [x] Phase 0: agent.md created
- [x] Phase 1: Codebase archaeology complete
- [x] Phase 2: Internet research complete
- [x] Phase 3: Architecture decisions made
- [x] Phase 4: Development plan written
- [x] Phase 5: All output artifacts written

## Project Identity
- **Name:** Singularity
- **Type:** Multi-provider AI coding agent desktop app
- **Stack:** Electron + TypeScript + React + Vite
- **Inspired by:** Piebald, AionUI, Qwen Code

## Login Model (Piebald-style)
Users link their own existing provider accounts. No Singularity account needed.

| Provider       | Auth Method             | Status     |
|----------------|-------------------------|------------|
| Google/Gemini  | OAuth credential import + PKCE fallback | planned    |
| GitHub/Copilot | OAuth Device Flow       | planned    |
| Qwen.ai        | OAuth Device Flow       | planned    |
| Anthropic      | API Key                 | planned    |
| OpenAI         | API Key                 | planned    |
| OpenRouter     | API Key                 | planned    |

## Void Archaeology Summary

**Directory:** `~/Documents/Coding/void`

**What it is:** Full source of Void Editor (VS Code fork by voideditor.com), not a custom Singularity codebase.

**Singularity-specific work:** Extensive planning/analysis documents + partially implemented services within the Void codebase:
- **ACP Protocol Layer** — `cliSessionManager.ts` (783 lines), `acpProtocol.ts` (JSON-RPC 2.0 types), `cliRegistry.ts`, `envUtils.ts` — **HIGHLY SALVAGEABLE**
- **18+ Singularity services** — Multi-agent orchestration, agent planning, self-correction, tool chaining, semantic search, multi-file apply, data redaction, streaming performance — all as TypeScript files with test suites
- **425+ unit tests** — Comprehensive test coverage for all services
- **CLI provider** — Detects and spawns `gh`, `gemini-cli`, `qwen-cli` with ACP communication

**What was broken/never completed:**
- `npm run watch` fails (909-line error log)
- Services not integrated into actual UI — standalone files with mocks
- No standalone Electron app — everything embedded in VS Code fork
- No OAuth credential import from `~/.gemini/` or `~/.claude/`
- No session persistence, no tool call inspector, no settings page
- No packaging for distribution

**What was never started (per new Singularity spec):**
- Standalone Electron app (original was VS Code fork)
- Piebald-style credential import
- GitHub Copilot OAuth Device Flow
- Qwen.ai OAuth integration
- Parallel agent sessions
- Tool call inspector UI
- Packaging (.deb, .dmg, .exe)

**Salvageable code:** `acpProtocol.ts`, `cliSessionManager.ts`, `cliRegistry.ts`, `envUtils.ts`, `modelCapabilities.ts` — approximately 1,500 lines of CLI/ACP code directly reusable for new Singularity.

**Verdict:** The void directory is primarily a VS Code fork with excellent planning docs. The ACP/CLI layer is the most valuable artifact for the new standalone Singularity.

## Research Findings

### Key Discovery: Piebald Uses Credential Import, Not Pure OAuth
Piebald reads credentials from existing CLI tools: `~/.claude/credentials.json` (Claude), direct OAuth sign-in (Google/Gemini), OAuth Device Flow (GitHub Copilot). Singularity should follow this hybrid model.

### Gemini CLI OAuth Token Format
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
**CRITICAL:** OAuth tokens use `https://cloudcode-pa.googleapis.com/v1internal`, NOT the public API endpoint.

### ACP Protocol
JSON-RPC 2.0 over stdio. Used by AionUI to wrap Claude Code, Qwen Code, Copilot CLI, and more. Newline-delimited JSON on stdout. Full protocol flow: initialize → authenticate → session/new → session/prompt → streaming updates → end_turn.

### GitHub Copilot Device Flow
- Device code: `POST https://github.com/login/oauth/device/code`
- Token poll: `POST https://github.com/github.com/login/oauth/access_token`
- Scopes: `read:user`
- Token storage: Third-party tools use `~/.claude-copilot-auth.json`

### Electron safeStorage on Linux
Requires kwallet or gnome-libsecret. Falls back gracefully when unavailable. Can force backend via `--password-store=gnome-libsecret`.

### Open Questions (Unresolved)
1. **Qwen.ai OAuth endpoints** — Not publicly documented
2. **Gemini OAuth refresh client_id** — Embedded in Gemini CLI, not public
3. **GitHub Copilot client_id** — Official CLI uses GitHub's first-party OAuth app
4. **SafeStorage on headless Linux** — Graceful degradation needed

## Architecture Decisions

See `ARCHITECTURE.md` for full ADR. Key decisions:

1. **Auth:** Hybrid credential import + direct OAuth per provider
2. **Process Model:** Electron main process handles auth, CLI spawning, storage. Renderer handles UI.
3. **CLI Wrapping:** ACP protocol with stdio piping, adapted from void's implementation
4. **Provider Interface:** Unified `AIProvider` TypeScript interface
5. **State:** File-based persistence in `~/.config/singularity/`
6. **Security:** safeStorage encryption with AES-256-GCM fallback

## Blockers

- **Qwen.ai OAuth endpoints** need reverse-engineering from Qwen Code CLI or direct contact with Qwen team. Alternative: start with API key path for Qwen providers.
- **Gemini OAuth refresh** may require using Gemini CLI's embedded OAuth client credentials or registering a separate Google Cloud OAuth app.

## Output Artifacts Checklist

| File | Written | Key Finding / Note |
|------|---------|-------------------|
| agent.md | ✅ | This file |
| ARCHITECTURE.md | ✅ | Full ADR with auth flows, IPC channels, provider interface |
| DEVELOPMENT_PLAN.md | ✅ | 15 milestones (M0-M14) with parallelism map |
| RESEARCH.md | ✅ | 7 research topics with sources and confidence scores |
| VOID_ARCHAEOLOGY.md | ✅ | Void is VS Code fork; ACP layer most salvageable |
| package.json | ✅ | Electron 34, React 19, TypeScript 5.8, Vite 6, all deps |
| PROJECT_BRIEF.md | ✅ | One-page summary with provider matrix and login model |
