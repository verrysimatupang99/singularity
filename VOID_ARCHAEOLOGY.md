# Singularity — Void Archaeology Report

**Date:** 2026-04-10  
**Phase:** 1 — Codebase Archaeology  
**Directory:** `~/Documents/Coding/void`

---

## Executive Summary

The `~/Documents/Coding/void` directory contains the **full source code of Void Editor** (a VS Code fork by voideditor.com), **not** a custom Singularity codebase. Singularity was a **planned enhancement concept** documented within the Void repo through a series of analysis and planning markdown files. No standalone Singularity Electron app was ever started.

**Key insight:** The original "Singularity" concept was a **VS Code fork enhancement** (multi-agent orchestration, CLI wrapping, provider abstraction). The new Singularity spec calls for a **standalone Electron app from scratch** — a fundamentally different approach.

---

## What Was Built

### Void Editor (the base project) — ~95% Complete
The Void repo is a mature VS Code fork with an AI chat sidebar. It includes:
- **17+ LLM provider integrations** (OpenAI, Anthropic, Google Vertex, Ollama, Mistral, Cohere, AI21, Together AI, Anyscale, etc.)
- **React-based chat UI** embedded in the VS Code sidebar
- **MCP server support**
- **Streaming performance optimizations** (token batching, UI debouncing)
- **Data redaction service** for privacy
- **CLI provider** that can spawn `gh-copilot`, `gemini-cli`, and `qwen-cli`
- **ACP (Agent Client Protocol)** implementation for structured CLI communication
- **Multi-agent orchestration, agent planning, self-correction, tool chaining, semantic code search, multi-file apply** — all as TypeScript service files with comprehensive test suites

### Singularity Concept Documents — 100% Planning, 0% Implementation
The Singularity-specific files in the repo are:

| File | Type | Content |
|------|------|---------|
| `SINGULARITY.md` | Vision doc | Multi-agent orchestration concept, "Universal Bridge" architecture |
| `SINGULARITY_PHASE1_COMPLETE.md` | Progress report | Claims 100% completion of Phase 1 (providers, redaction, streaming) |
| `SINGULARITY_PHASE2_COMPLETE.md` | Progress report | Claims 100% completion of Phase 2 (multi-agent, planning, self-correction) |
| `SINGULARITY_PHASE2_PROGRESS.md` | Progress report | Detailed task breakdown |
| `SINGULARITY_PHASE3_*.md` | Progress report | Phase 3 documentation (truncated filenames) |
| `SINGULARITY-ACP-IMPLEMENTATION.md` | Architecture doc | ACP protocol layer implementation details |
| `SINGULARITY-ACP-TEST-RESULTS.md` | Test results | ACP protocol test results |
| `SINGULARITY-CLI-INTEGRATION-ANALYSIS.md` | Analysis | Deep analysis of CLI wrapping strategy |
| `SINGULARITY-DEEP-INTEGRATION-ANALYSIS.md` | Analysis | Comprehensive integration analysis |

### Singularity-Specific Code in Void — Partial Implementation

Within `src/vs/workbench/contrib/void/`:

**Services Created (as TypeScript files, claimed tested):**
| Service | File | Lines | Status |
|---------|------|-------|--------|
| Multi-Agent Orchestration | `multiAgentOrchestrationService.ts` | 550+ | Created + tested |
| Agent Planning | `agentPlanningService.ts` | 550+ | Created + tested |
| Self-Correction | `selfCorrectionService.ts` | 450+ | Created + tested |
| Tool Chaining | `toolChainingService.ts` | 500+ | Created + tested |
| Semantic Code Search | `semanticCodeSearchService.ts` | 450+ | Created + tested |
| Multi-File Apply | `multiFileApplyService.ts` | 500+ | Created + tested |
| Data Redaction | `dataRedactionService.ts` | 375 | Created + tested |
| Streaming Performance | `streamingPerformanceService.ts` | 360 | Created + tested |

**ACP Protocol Layer (Most Valuable for Singularity):**
| File | Lines | Content |
|------|-------|---------|
| `electron-main/acp/acpProtocol.ts` | ~200 | JSON-RPC 2.0 types, ACP message helpers |
| `electron-main/acp/cliSessionManager.ts` | 783 | CLI spawn, ACP handshake, stdio streaming |
| `electron-main/acp/cliRegistry.ts` | ~100 | CLI backend configuration registry |
| `electron-main/acp/envUtils.ts` | ~100 | Environment preparation for CLI spawn |
| `electron-main/acp/index.ts` | ~20 | Barrel exports |

**Test Files (12 test files, 2,070+ lines total):**
All tests exist as TypeScript files with claimed 185+ tests for Phase 1 and 240+ tests for Phase 2.

---

## What Was Working vs Broken

### Working (per documentation claims)
- Void Editor builds and runs as a VS Code fork
- 17+ LLM providers integrated with API key auth
- CLI provider detects and spawns `gh`, `gemini-cli`, `qwen-cli`
- ACP protocol layer implemented with full JSON-RPC 2.0 support
- CLI session manager handles spawn, auth handshake, stdio streaming
- Data redaction service with regex-based sensitive data detection
- Streaming performance optimizations (batching + debouncing)
- 425+ unit tests across all Singularity services

### Broken / Never Completed
- **npm run watch fails** — `error_npm_run_watch.md` (909 lines) shows build errors
- **Multi-agent orchestration** — services exist as TypeScript files but are NOT integrated into the Void UI or main process. They are standalone services with test mocks, not wired into the actual editor.
- **No standalone Electron app** — Everything is embedded in the VS Code fork. The new Singularity spec requires a standalone app.
- **No Piebald-style credential import** — The Void codebase uses API keys for all providers. No OAuth credential file reading from `~/.gemini/` or `~/.claude/`.
- **No settings.json provider config** — Uses Void's own settings UI, not the Qwen Code `settings.json` format.
- **No session persistence** — No conversation/session save/restore mechanism.
- **No MCP server manager UI** — MCP service exists but no management UI.
- **No tool call inspector** — Tool calls are logged but not inspected in a dedicated UI.

---

## Architectural Decisions Already Committed To

1. **VS Code Fork as Base** — The original Singularity was planned as a Void/VS Code enhancement, not a standalone app. This decision is **reversed** by the new spec.

2. **ACP Protocol for CLI Communication** — The void repo has a full ACP implementation with JSON-RPC 2.0 types, session management, and stdio streaming. This is **salvageable and valuable** for the new Singularity.

3. **CLI Provider Pattern** — Detecting CLI binaries (`gh`, `gemini`, `qwen`) via `PATH` scanning. Useful pattern for the new app.

4. **Model Capabilities System** — `modelCapabilities.ts` defines context windows, pricing, tool support per model. Useful reference data.

5. **Service Registration Pattern** — Void uses a service-based architecture with dependency injection. The new Electron app will use a different pattern (IPC-based).

---

## Salvageable Code Worth Keeping

| Code | Value for New Singularity | Reuse Potential |
|------|--------------------------|-----------------|
| `acpProtocol.ts` | **HIGH** — ACP JSON-RPC types are protocol-standard | Direct copy + adapt |
| `cliSessionManager.ts` | **HIGH** — CLI spawn + stdio streaming logic | Direct copy + adapt for Electron main process |
| `cliRegistry.ts` | **MEDIUM** — CLI config registry | Useful reference |
| `envUtils.ts` | **MEDIUM** — Environment prep for CLI spawn | Directly useful |
| `modelCapabilities.ts` | **MEDIUM** — Model definitions | Reference data, needs updating |
| `dataRedactionService.ts` | **LOW-MEDIUM** — Privacy feature | Optional |
| `streamingPerformanceService.ts` | **LOW-MEDIUM** — Batching/debouncing | Optional |
| Multi-agent/planning/self-correction services | **LOW** — Too tightly coupled to VS Code | Architecture reference only |
| Test files | **MEDIUM** — Test patterns and mocks | Reference for writing new tests |
| `sendLLMMessage.impl.ts` | **MEDIUM** — Provider routing logic | Reference for provider abstraction |

### Not Salvageable
- All VS Code-specific code (`src/vs/` directory — 100K+ files)
- React components built for VS Code sidebar
- Gulp build system
- VS Code extension infrastructure
- Void's settings UI

---

## What Was Never Started

1. **Standalone Electron app** — Everything is embedded in VS Code
2. **OAuth credential import** from `~/.gemini/oauth_creds.json` or `~/.claude/credentials.json`
3. **GitHub Copilot OAuth Device Flow** implementation (only detection of `gh` binary)
4. **Qwen.ai OAuth** integration
5. **Per-session configuration** — No session isolation
6. **Session persistence** — No save/restore of conversations
7. **Settings page** for provider connection management
8. **Packaging** for distribution (.deb, .AppImage, .dmg, .exe)
9. **Parallel agent sessions** — Only single chat thread supported
10. **Tool call inspector UI** — Tool calls shown inline only

---

## Git History Analysis

- **Last commit:** `17e7a5b1` — "Update README.md"
- **Total commits:** 2,000+ (mostly Void Editor development)
- **No Singularity-specific commits** — All Singularity work exists as uncommitted files in the working tree
- **No stashed work** — `git stash list` is empty
- **Branch:** `main` only, tracking `origin/main`

---

## Conclusion

The void directory contains a **wealth of research and planning documents** and a **partially-implemented ACP/CLI layer** that is directly relevant to the new Singularity. However, the original approach (VS Code fork) is being abandoned in favor of a **standalone Electron app**.

**Key takeaway:** The `acpProtocol.ts`, `cliSessionManager.ts`, and associated ACP files in `src/vs/workbench/contrib/void/electron-main/acp/` are the **most valuable artifacts** to carry forward. Everything else is either VS Code-specific or exists only as documentation.
