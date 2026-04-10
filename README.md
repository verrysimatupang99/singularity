# Singularity

Standalone auth-first AI coding orchestrator (non-VSCode fork) inspired by qwen-code, AioUI, and gemini-cli-desktop.

## Current MVP Foundation

- Monorepo structure (`apps/*`, `packages/*`)
- Provider adapters: **Qwen**, **Gemini**, **GitHub Copilot**
- Auth adapters with CLI login checks
- Workspace-aware execution (`workspacePath` required)
- Plan approval gate for edit intent
- Security baseline:
  - subprocess env sanitization
  - secret redaction for logs
  - encrypted local token store (AES-256-GCM)

## Quick Start

```bash
npm install
npm run build
npm test
```

Run desktop CLI shell:

```bash
node apps/desktop/dist/index.js \
  --provider=qwen \
  --intent=read_only \
  --workspace=/path/to/project \
  --prompt="Explain this repository"
```
