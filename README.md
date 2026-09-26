# 🧰 pi-toolkit

> Organization-wide **Pi agent** extensions, on-demand skills, themes, local model management, and workflow prompt templates.

`pi-toolkit` turns [@earendil-works/pi-coding-agent](https://pi.dev) into a full-featured, batteries-included engineering harness. Instead of bloating context windows upfront, Pi dynamically loads specialized skills on-demand, enforces strict safety boundaries, isolates sub-agents, connects external MCP servers, guides Spec-Driven Development (SDD), and provides instant workflow commands.

---

## 📁 Repository Structure

```text
pi-toolkit/
├── package.json                # Package manifest, scripts & peerDependencies
├── tsconfig.json               # Strict TypeScript configuration
├── eslint.config.js            # Flat ESLint config (no-console, strict TS)
├── .prettierrc                 # Code formatting standards
├── bootstrap.sh                # 1-step bootstrap script for new machines
├── .husky/
│   └── pre-commit              # Git pre-commit hook (typecheck + lint-staged)
├── README.md                   # Full documentation & usage instructions
├── .gitignore                  # Git exclusions (.DS_Store, logs, node_modules)
├── scripts/
│   └── model-manager.ts        # CLI to inspect, switch & symlink local AI models (pnpm model)
├── themes/
│   └── cyber-obsidian.json     # High-contrast developer dark theme
├── extensions/
│   ├── sdd.ts                  # Native Spec-Driven Development (github/spec-kit) & /sdd
│   ├── subagent.ts             # Isolated sub-agent runner (tool + /subagent command)
│   ├── plan-mode.ts            # Read-only planning mode (Ctrl+Alt+P or /plan)
│   ├── safety-guard.ts         # Sensitive file shield & destructive command gate
│   ├── mcp-bridge.ts           # On-demand Model Context Protocol bridge (/mcp)
│   ├── agy.ts                  # Antigravity CLI integration & /agy command
│   └── shared/
│       └── exec-safe.ts        # Safe process runner (shell: false, signals, truncation)
├── skills/
│   ├── sdd-methodology/
│   │   └── SKILL.md            # Spec-Kit workflow, constitution, spec, plan & tasks templates
│   ├── antigravity/
│   │   └── SKILL.md            # Guidelines for invoking agy, subagents & MCP
│   ├── app-store-connect/
│   │   └── SKILL.md            # Apple App Store, TestFlight & asc CLI automation
│   ├── expo-mobile/
│   │   └── SKILL.md            # React Native, Expo Router & 60/120 FPS patterns
│   ├── nx-monorepo/
│   │   └── SKILL.md            # Nx workspace, caching & module boundaries
│   ├── tanstack-vite/
│   │   └── SKILL.md            # TanStack Router v1, Query, loaders & head() SEO
│   ├── web-design/
│   │   └── SKILL.md            # Vite SPA, dumb views, MVC & Liquid Glass tokens
│   └── web-perf/
│       └── SKILL.md            # Core Web Vitals (LCP, INP, CLS) & Lighthouse audits
├── prompts/
│   ├── arch-review.md          # /arch-review read-only architecture & dependency audit
│   ├── audit.md                # /audit multi-dimensional code quality & security audit
│   ├── handoff.md              # /handoff context compaction & session handoff generator
│   ├── init-project.md         # /init-project scaffolds tailored AGENTS.md
│   ├── release-check.md        # /release-check pre-release verification gates
│   └── tanstack-route.md       # /tanstack-route scaffolds TanStack Router routes
└── templates/
    └── AGENTS.base.md          # Master organization AGENTS.md baseline template
```

---

## 🚀 Quick Start & Installation

### 1-Line Bootstrap on Any Machine

```bash
curl -fsSL https://raw.githubusercontent.com/bishalg/pi-toolkit/main/bootstrap.sh | bash
```

### Manual Installation

Install globally from GitHub on any developer machine or CI pipeline:

```bash
pi install git:github.com/bishalg/pi-toolkit
```

Or install project-locally into `.pi/settings.json`:

```bash
pi install git:github.com/bishalg/pi-toolkit --local
```

### Local Live Development

Install directly from your local repository. Changes are immediately available across all projects upon running `/reload` inside Pi:

```bash
pi install ~/Documents/WORK/Open\ Source/pi-toolkit
```

---

## ⚡ Extensions & Capabilities

### 1. Spec-Driven Development (`extensions/sdd.ts`)

Brings native **Spec-Driven Development (SDD)** inspired by `github/spec-kit` directly into Pi with **zero repo pollution** and **hard tool gating**.

| Command               | SDD Phase           | Generated Artifact        | Pi Enforcement & Gating                                                                                  |
| :-------------------- | :------------------ | :------------------------ | :------------------------------------------------------------------------------------------------------- |
| `/sdd constitution`   | **0. Ground Rules** | `specs/constitution.md`   | Read-only scan; writes architectural non-negotiables.                                                    |
| `/sdd specify <idea>` | **1. What & Why**   | `specs/001-slug/spec.md`  | Auto-numbers folder; writes user stories & Gherkin acceptance criteria (no tech stack). **Code locked.** |
| `/sdd clarify`        | **2. De-risk**      | Updates `spec.md`         | Audits `spec.md` for ambiguities and asks 3–5 targeted questions. **Code locked.**                       |
| `/sdd plan`           | **3. How (Arch)**   | `specs/001-slug/plan.md`  | Maps packages, schemas, and UI boundaries validated against `specs/constitution.md`. **Code locked.**    |
| `/sdd tasks`          | **4. Breakdown**    | `specs/001-slug/tasks.md` | Converts `plan.md` into ordered, checkable `[ ] T001` atomic work items. **Code locked.**                |
| `/sdd implement`      | **5. Execute**      | Application code          | **Unlocks codebase writes.** Executes `tasks.md` sequentially, marking `[x]` as tests pass.              |
| `/sdd audit`          | **6. Verify**       | Alignment report          | Cross-checks implemented git diff against `spec.md` and `constitution.md`.                               |
| `/sdd status`         | Status              | TUI message               | Displays active feature, current phase, and task progress.                                               |
| `/sdd off`            | Exit                | Reset to idle             | Returns agent to standard interactive mode.                                                              |

- **Hard Tool Guardrails**: During phases 0–4 (`constitution`, `specify`, `clarify`, `plan`, `tasks`), Pi intercepts `write` and `edit` calls. The agent is **strictly blocked** from modifying application files (`apps/`, `packages/`, `src/`) and can only modify files inside `specs/`.
- **Live TUI Status Bar**: Displays `SDD: 001-slug [PLAN - Code Locked]` or `SDD: 001-slug [IMPLEMENT - 3/8 Tasks]` in the terminal status bar.

#### 💡 When to Use `/plan` vs `/sdd`

- **Use `/plan`** for **15-minute tasks**: Quick bug fixes, small refactors, or tweaking a single component where a `specs/` directory is overkill.
- **Use `/sdd`** for **multi-file features**: Adding cross-package monorepo modules, altering database/API schemas, or writing features that another developer or sub-agent will review or continue later.

---

### 2. Sub-Agent Delegation (`extensions/subagent.ts`)

Spawns isolated, headless Pi child processes (`pi -p --mode json`) to execute secondary tasks without contaminating the parent context window.

- **Agent Tool (`subagent`)**: Allows the primary agent to delegate focused tasks (e.g., codebase exploration, deep audits, test generation) with a defined model, budget, and scope.
- **Slash Command (`/subagent <task>`)**: User command to quickly launch a background sub-agent.
- **Safe Sandboxing**: Child processes run in isolated contexts with separate working directories and strict execution timeouts.

---

### 3. Plan Mode (`extensions/plan-mode.ts`)

Puts the agent into a strict read-only planning state before any code is modified.

- **Toggle via Shortcut**: Press `Ctrl+Alt+P` anytime to toggle Plan Mode on/off.
- **Slash Command (`/plan [on|off]`)**: Switch modes programmatically.
- **Strict Guardrails**: When active, all mutating tools (`write`, `edit`) are disabled via `pi.setActiveTools()`. Bash commands are filtered through a strict read-only allowlist (`ls`, `cat`, `git status`, `git diff`, `grep`, `find`, etc.).

---

### 4. Safety Guard (`extensions/safety-guard.ts`)

Active shield preventing data loss, credential leaks, and accidental system damage.

- **Sensitive File Shield**: Blocks modifications or deletions of `.env*`, `.git/`, credentials (`id_rsa`, `.p8`, `.pem`), and CI secrets.
- **Destructive Command Interceptor**: Intercepts high-risk shell commands (`rm -rf`, `git push --force`, `git reset --hard`, `mkfs`, `sudo`) and pauses execution until explicit user confirmation is granted in the TUI.
- **Slash Command (`/safety`)**: View current protection status and intercepted statistics.

---

### 5. MCP Bridge (`extensions/mcp-bridge.ts`)

Dynamic, on-demand connection to **Model Context Protocol (MCP)** servers over standard `stdio`.

- **Slash Command (`/mcp`)**: Interactive manager to list, connect, disconnect, and inspect tools from configured MCP servers:
  ```text
  /mcp list
  /mcp connect <serverName>
  /mcp disconnect <serverName>
  ```
- **Configuration**: Automatically reads server definitions from `.pi/mcp.json` or `~/.pi/mcp.json`.

---

### 6. Antigravity CLI Integration (`extensions/agy.ts`)

Bridges Pi directly to Google Antigravity CLI tools.

- **Agent Tool (`agy`)**: Direct tool access for the model to invoke `agy` operations.
- **Slash Command (`/agy`)**: Interactive terminal completions:
  ```text
  /agy models
  /agy plugin list
  /agy mcp list
  /agy changelog
  ```
- **Shared Safe Runner (`extensions/shared/exec-safe.ts`)**: Built with `shell: false`, streaming output, argument tokenization, POSIX signal handling (SIGTERM -> SIGKILL), and output truncation guards (>2,000 lines or >50KB).

---

## 🎨 Themes

### Cyber Obsidian (`themes/cyber-obsidian.json`)

A developer-first, high-contrast dark theme inspired by Obsidian and Cyberpunk aesthetics:

- Ultra-deep obsidian background (`#0d1117`) with crisp electric cyan (`#58a6ff`), mint green (`#3fb950`), vibrant coral (`#f85149`), and warm amber (`#d29922`) highlights.
- Selectable directly inside Pi via the theme picker or in `~/.pi/agent/settings.json`.

---

## 🧠 Local Model Management (`scripts/model-manager.ts`)

Manage, inspect, benchmark, switch, and symlink local GGUF/Safetensors weights across Antigravity IDE and local AI harnesses:

```bash
# Launch interactive local model manager
pnpm model

# Or run directly via Node
node --experimental-strip-types scripts/model-manager.ts
```

- **HDD Model Scanner**: Scans common AI cache paths (`~/.ollama`, `~/.cache/huggingface`, `~/.lmstudio`, `~/.local/share/nomic.ai`) for downloaded weights.
- **Benchmark & RAM Sizing**: Displays parameter count, quantization format, RAM requirements, and coding benchmark intelligence scores.
- **Quick Switching**: Toggles between cloud-only (low RAM usage) and local hybrid execution modes.

---

## 📚 On-Demand Skills (`skills/`)

Skills are loaded into the agent's context dynamically when relevant tasks are triggered:

- **`sdd-methodology`** (`skills/sdd-methodology/`): Spec-Driven Development methodology inspired by `github/spec-kit`. Standardized templates for `constitution.md`, `spec.md`, `plan.md`, and `tasks.md`.
- **`antigravity`** (`skills/antigravity/`): Delegation patterns for autonomous background agents, provider quotas, and MCP tools.
- **`app-store-connect`** (`skills/app-store-connect/`): Complete Apple release lifecycle: automated Xcode builds, build number auto-incrementing, TestFlight beta tester orchestration, metadata push/pull, and App Store review submission via `asc`.
- **`expo-mobile`** (`skills/expo-mobile/`): React Native and Expo Router architecture, 60/120 FPS UI thread animations, FlashList performance, and Liquid Glass design.
- **`nx-monorepo`** (`skills/nx-monorepo/`): Enterprise monorepo boundaries, dependency linting, computation caching, and barrel export optimization.
- **`tanstack-vite`** (`skills/tanstack-vite/`): TanStack Router v1, query prefetching in route loaders, mandatory `head()` SEO contracts, and Vite bundle splitting.
- **`web-design`** (`skills/web-design/`): Modern web frontend standards, strict MVC dumb-view architecture, Liquid Glass tokens (`GlassCard`, `GlassInput`), and anti-slop typography.
- **`web-perf`** (`skills/web-perf/`): Core Web Vitals (LCP, INP, CLS) optimization, render-blocking asset mitigation, long-task reduction, and Lighthouse 90+ score enforcement.

To explicitly force Pi to load a specific skill:

```text
/skill:sdd-methodology draft functional specification for offline sync
/skill:app-store-connect prepare build and submit to TestFlight
/skill:web-perf audit LCP and layout shifts on landing page
/skill:tanstack-vite configure loader prefetching for dynamic route
/skill:nx-monorepo check dependency graph for circular references
```

---

## 📝 Workflow Prompts (`prompts/`)

Reusable `/` slash commands for engineering workflows:

- **`/arch-review [scope]`**: Performs a read-only architectural review evaluating module boundaries, circular dependencies, state ownership, and concurrency lifecycles.
- **`/audit [target]`**: Multi-dimensional codebase audit checking architecture boundaries, type safety, secret leakage, logging hygiene, and accessibility.
- **`/handoff [target]`**: Compiles current session context, git status, completed changes, verification results, and remaining roadmap into a clean handoff document.
- **`/init-project [notes]`**: Scans repository structure and bootstraps a tailored `AGENTS.md` based on `templates/AGENTS.base.md`.
- **`/release-check [branch]`**: Pre-release verification checklist validating git cleanliness, unit tests (TDD), typechecks, linters, production builds, and changelogs.
- **`/tanstack-route <path>`**: Scaffolds a complete TanStack Router route with SEO metadata, loader prefetching, and MVC separation.

---

## 🛡️ Code Quality & Pre-Commit Hooks

`pi-toolkit` enforces strict quality standards via **Husky** and **lint-staged**:

- **Type Safety**: `pnpm run typecheck` (`tsc --noEmit`) validates all extensions without emitting artifacts.
- **Linting**: `pnpm run lint` (`eslint extensions/`) enforces strict TypeScript rules, zero unused variables, and zero console logs in production code.
- **Formatting**: `pnpm run format:check` verifies Prettier compliance across all files.

To run full project verification:

```bash
pnpm run check
```

---

## 🤝 Contributing

1. Fork or branch from `main` (or `dev`).
2. Add new extensions to `extensions/`, skills to `skills/<name>/SKILL.md`, prompts to `prompts/<name>.md`, or themes to `themes/<name>.json`.
3. Test locally in Pi with `/reload`.
4. Ensure `pnpm run check` passes before committing.
5. Submit a Pull Request.

---

## 📄 License

MIT © [Bishal Ghimire](https://github.com/bishalg)
