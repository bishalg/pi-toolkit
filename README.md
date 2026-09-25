# 🧰 pi-toolkit

> Organization-wide **Pi agent** extensions, on-demand skills, and workflow prompt templates.

`pi-toolkit` provides a modular architecture for the [Pi Coding Agent](https://pi.dev). Instead of bloating the agent's context window with every convention upfront, Pi loads specialized skills on-demand and exposes targeted developer tools (`/agy`, `/audit`, `/release-check`, `/tanstack-route`, `/init-project`).

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
├── extensions/
│   ├── agy.ts                  # Antigravity CLI integration & /agy command
│   └── shared/
│       └── exec-safe.ts        # Shared safe process runner (shell: false, signals)
├── skills/
│   ├── antigravity/
│   │   └── SKILL.md            # Guidelines for invoking agy, subagents & MCP
│   ├── nx-monorepo/
│   │   └── SKILL.md            # Nx workspace, caching & module boundaries
│   ├── expo-mobile/
│   │   └── SKILL.md            # React Native, Expo Router & 60/120 FPS patterns
│   ├── tanstack-vite/
│   │   └── SKILL.md            # TanStack Router v1, Query, loaders & head() SEO
│   └── web-design/
│       └── SKILL.md            # Vite SPA, dumb views, MVC & Liquid Glass tokens
├── prompts/
│   ├── audit.md                # /audit slash command for code quality
│   ├── release-check.md        # /release-check slash command for release gates
│   ├── tanstack-route.md       # /tanstack-route slash command for route scaffolding
│   └── init-project.md         # /init-project slash command to scaffold AGENTS.md
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

## ⚡ Features & Modules

### 1. Antigravity CLI Extension (`extensions/agy.ts`)

Connects Pi directly to the **Antigravity CLI (`agy`)**:

- **Agent Tool (`agy`)**: The agent can autonomously execute CLI commands, models discovery, and MCP listings using discrete argument arrays.
- **Slash Command (`/agy`)**: Interactive terminal command with argument completions and operation pickers:
  ```text
  /agy models
  /agy plugin list
  /agy mcp list
  /agy changelog
  ```
- **Shared Process Safety (`extensions/shared/exec-safe.ts`)**: Built with `shell: false` (immune to shell injection), streaming output updates, POSIX argument tokenizer, signal cleanup (SIGTERM -> SIGKILL), and automatic output truncation protection (>2,000 lines or >50KB).

### 2. On-Demand Skills (`skills/`)

Pi advertises these skills by name and description, loading their full guidelines into context only when needed:

- **`antigravity`** (`skills/antigravity/`): Guidance on delegating long-running autonomous tasks, checking provider limits, and querying MCP tools.
- **`nx-monorepo`** (`skills/nx-monorepo/`): Enterprise Nx architectural boundaries, `scope:*` and `type:*` tags, computation caching, and barrel export optimization.
- **`expo-mobile`** (`skills/expo-mobile/`): React Native and Expo Router standards, UI-thread animations (Reanimated worklets), FlashList optimization, offline-first sync, and iOS Liquid Glass styling.
- **`tanstack-vite`** (`skills/tanstack-vite/`): TanStack Router (`createFileRoute`, search param validation, loader prefetching), mandatory `head()` SEO metadata contract, SPA navigation contract, and Vite chunk splitting.
- **`web-design`** (`skills/web-design/`): Modern web frontend standards, strict MVC dumb-view separation, Liquid Glass tokens (`GlassCard`, `GlassInput`), edge CDN responsive image optimization, and anti-slop typography.

To explicitly force Pi to load a skill:

```text
/skill:tanstack-vite configure loader prefetching for dynamic route
/skill:nx-monorepo check dependency graph for circular references
/skill:expo-mobile optimize profile scroll performance
```

### 3. Workflow Prompts (`prompts/`)

Reusable `/` slash commands:

- **`/init-project`**: Scans the current repository and bootstraps a tailored `AGENTS.md` based on `templates/AGENTS.base.md`, with recommended skills and quality gates.
- **`/tanstack-route <path>`**: Scaffolds a complete TanStack Router route file with `head()` SEO metadata, TanStack Query prefetching, and MVC separation.
  ```text
  /tanstack-route /items/$id
  ```
- **`/audit [target]`**: Multi-dimensional codebase audit checking architecture boundaries, type safety, secret leakage, logging hygiene, and accessibility.
  ```text
  /audit
  /audit packages/design-language-core
  ```
- **`/release-check [target-branch]`**: Multi-gate pre-release checklist validating git clean state, unit tests (TDD), typechecks, linters, production builds, and changelog updates.
  ```text
  /release-check
  /release-check dev
  ```

---

## 🧠 Pi Session & Context Best Practices

Take full advantage of Pi's native session commands:

- **`/compact [instructions]`**: Run targeted compaction (e.g. `/compact Keep all TypeBox schema rules and decisions`) before switching tasks. Compresses older messages while preserving key decisions.
- **`/tree`**: View session branches. Experiment with alternative implementations on different branches; switching branches automatically records a summary of the abandoned path.
- **`/fork`**: Spin off an unexpected bug investigation or side quest into a clean, standalone session file.
- **`/clone`**: Duplicate the active session branch into a new session.
- **`--session-dir <dir>`**: Group session history into a custom directory or project-local sync folder (`export PI_CODING_AGENT_SESSION_DIR=.pi/sessions`).

---

## 🛡️ Code Quality & Pre-Commit Hooks

`pi-toolkit` enforces strict quality standards via **Husky** and **lint-staged**:

- **Type Safety**: `npm run typecheck` (`tsc --noEmit`) validates all extensions without emitting artifacts.
- **Linting**: `npm run lint` (`eslint extensions/`) enforces strict TypeScript rules, zero console logs, and safe error handling.
- **Formatting**: `npm run format:check` verifies Prettier compliance across all files.

To run manual verification:

```bash
npm run check
```

---

## 🛠️ Management & Verification

### View Configured Packages

```bash
pi list
```

### Reconcile or Update

```bash
pi update --extensions
```

### Remove Package

```bash
pi remove git:github.com/bishalg/pi-toolkit
```

---

## 🤝 Contributing

1. Fork or branch from `main` (or `dev`).
2. Add new extensions to `extensions/`, skills to `skills/<name>/SKILL.md`, or prompts to `prompts/<name>.md`.
3. Test locally in Pi with `/reload`.
4. Ensure `npm run check` passes before committing.
5. Submit a Pull Request.

---

## 📄 License

MIT © [Bishal Ghimire](https://github.com/bishalg)
