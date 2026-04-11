# Future Vision — Singularity

Features that have been prototyped or planned but are **not yet active** in the current release. These represent directions for future development.

---

## 1. Computer Use (CUA)

**Status:** Prototype removed from active codebase. Kept for future re-implementation.

**What it was:** Allow AI agents to control the desktop — take screenshots, click at coordinates, type text, press keys, and scroll. This would enable agents to interact with GUI applications, browsers, and any visual interface.

**Original implementation:**
- `src/main/services/computerUse.ts` — `ComputerUseController` class using `nut-js` for screen control
- Methods: `screenshot()`, `click(x, y)`, `type(text)`, `pressKey(key)`, `scroll(x, y, direction)`
- Graceful degradation when `nut-js` not available (no crash, just returns error)
- Integrated as agent tools: `take_screenshot`, `cua_click`, `cua_type`, `cua_key`

**Why deferred:**
- Requires native dependency (`nut-js` / `@nut-tree/nut-js`) that complicates installation
- Screen coordinate-based interaction is fragile across different monitor setups
- Not core to the primary "AI coding agent" use case

**To restore:**
1. Re-add `@nut-tree/nut-js` to `package.json` dependencies
2. Restore `src/main/services/computerUse.ts`
3. Re-add CUA tools to `src/main/services/agentTools.ts`
4. Re-add IPC handlers in `src/main/index.ts` and preload bridges
5. Re-add `ComputerUseView.tsx` component
6. Update `PanelState` in `LayoutContext.tsx` to include `computerUse`

---

## 2. Sandbox Testing (Multi-AI CI/CD)

**Status:** Documented concept, not implemented.

**Vision:** An automated pipeline where multiple AI agents collaborate on code quality:

```
┌─────────────────────────────────────────────────┐
│  Sandbox Testing Pipeline                        │
│                                                  │
│  1. Write Agent  → Generates code changes        │
│  2. Build Agent  → Runs build, checks errors     │
│  3. Test Agent   → Runs test suite               │
│  4. Fix Agent    → Fixes failing tests           │
│                                                  │
│  User receives report:                           │
│  "3 tests failed, AI fixed 2,                   │
│   1 needs manual review"                        │
└─────────────────────────────────────────────────┘
```

**How it would work:**
1. User sets trigger: "test setiap ada perubahan" (test on every change)
2. Orchestrator spawns isolated sandbox environment
3. Build agent runs build → Test agent runs tests → Fix agent fixes failures
4. User gets a report with auto-fixed and manual-review items

**Technical requirements:**
- Isolated sandbox (Docker container or VM)
- Project dependency installation in sandbox
- Build and test command execution
- Diff application and rollback
- Multi-agent coordination via Orchestrator

**Challenges:**
- Sandbox isolation adds significant complexity
- Need to handle different project types (Node.js, Python, Rust, etc.)
- Security: preventing malicious code execution on host

---

## 3. Google Stitch MCP (Design-to-Code)

**Status:** Service exists (`stitchMcp.ts`), not exposed in UI.

**What it is:** Google Stitch is a design-to-code tool that converts screen designs into React/Tailwind code.

**Existing implementation:**
- `src/main/services/stitchMcp.ts` — MCP server connection for Stitch
- Methods: `connect()`, `disconnect()`, `listScreens()`, `getScreen()`, `exportToReact()`, `exportToTailwind()`
- IPC handlers registered in `src/main/index.ts`
- Preload bridges: `stitchConnect`, `stitchDisconnect`, `stitchStatus`, `stitchListScreens`, `stitchGetScreen`, `stitchExportReact`, `stitchExportTailwind`

**To activate in UI:**
1. Add Stitch section to SettingsView under "Design Tools"
2. Create a Stitch panel accessible from the activity bar
3. Screen list view with export buttons (React / Tailwind)
4. Import exported code directly into the editor

---

## 4. Plugin Marketplace

**Status:** Core plugin loader exists. Registry/marketplace UI deferred.

**What exists:**
- `PluginLoader` class with `loadFromDir()`, `installPlugin()`, `installFromRegistry()`
- SHA-256 verification for downloaded plugins
- Plugin tool registration and handler execution
- Registry fetch from GitHub (`singularity-plugins` repo)

**What's deferred:**
- Marketplace UI in Settings (browse, install, update plugins)
- Plugin ratings and reviews
- Auto-update notifications for installed plugins
- Plugin sandboxing (restrict file system access)

**Future direction:**
- Community-contributed plugins via GitHub repo
- Plugins as ZIP downloads with manifest verification
- Plugin permissions model (read-only, file-write, terminal-access)

---

## 5. Multi-Window Support

**Status:** IPC handlers exist, not fully integrated into UX.

**What exists:**
- `window:open-new`, `window:close-current`, `window:set-title`, `window:list` IPC handlers
- `createSecondaryWindow()` in `main/index.ts`
- Preload bridges for all window operations

**Future use cases:**
- Open chat in one window, editor in another
- Multiple sessions side-by-side for comparison
- Dedicated orchestrator monitoring window

---

## 6. Local LLM beyond Ollama

**Status:** Ollama is the planned local provider (see main roadmap).

**Future extensions:**
- LM Studio integration (REST API compatible with OpenAI)
- llama.cpp direct integration (no server needed)
- vLLM for multi-model serving
- Auto-detection of any local OpenAI-compatible server on common ports (11434, 1234, 8080)
