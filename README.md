# 🧰 pi-toolkit

> Organization-wide **Pi agent** extensions, on-demand skills, and workflow prompt templates.

`pi-toolkit` provides a modular architecture for the [Pi Coding Agent](https://pi.dev). Instead of bloating the agent's context window with every convention upfront, Pi loads specialized skills on-demand and exposes targeted developer tools (`/agy`, `/audit`, `/release-check`).

---

## 📁 Repository Structure

```text
pi-toolkit/
├── package.json
├── README.md
├── .gitignore
├── extensions/
│   └── agy.ts                  # Antigravity CLI integration & /agy command
├── skills/
│   ├── antigravity/
│   │   └── SKILL.md            # Guidelines for invoking agy, subagents & MCP
│   ├── nx-monorepo/
│   │   └── SKILL.md            # Nx workspace, caching & module boundaries
│   ├── expo-mobile/
│   │   └── SKILL.md            # React Native, Expo Router & 60/120 FPS patterns
│   └── web-design/
│       └── SKILL.md            # Next.js RSC, MVC & Liquid Glass aesthetic
└── prompts/
    ├── audit.md                # /audit slash command for code quality
    └── release-check.md        # /release-check slash command for release gates
```

---

## 🚀 Quick Start & Installation

### Local Live Development
Install directly from your local repository. Changes are immediately available across all projects upon running `/reload` inside Pi:

```bash
pi install ~/Documents/WORK/Open\ Source/pi-toolkit
```

### Team & Remote Installation
Install globally from GitHub on any developer machine or CI pipeline:

```bash
pi install git:github.com/bishalg/pi-toolkit
```

Or install project-locally into `.pi/settings.json`:

```bash
pi install git:github.com/bishalg/pi-toolkit --local
```

---

## ⚡ Features & Modules

### 1. Antigravity CLI Extension (`extensions/agy.ts`)
Connects Pi directly to the **Antigravity CLI (`agy`)**:
- **Agent Tool (`agy`)**: The agent can autonomously execute CLI commands, models discovery, and batch prompt delegation using discrete argument arrays.
- **Slash Command (`/agy`)**: Interactive terminal command with argument completions and operation pickers:
  ```text
  /agy models
  /agy plugin list
  /agy mcp list
  /agy changelog
  /agy -p "Review this file for vulnerabilities"
  ```
- **Process Safety**: Spawned with `shell: false` (immune to shell injection), streaming output updates, and automatic truncation protection (>2,000 lines or >50KB).

### 2. On-Demand Skills (`skills/`)
Pi advertises these skills by name and description, loading their full guidelines into context only when needed:
- **`antigravity`** (`skills/antigravity/`): Guidance on delegating long-running autonomous tasks, checking provider limits, and querying MCP tools.
- **`nx-monorepo`** (`skills/nx-monorepo/`): Enterprise Nx architectural boundaries, `scope:*` and `type:*` tags, computation caching, and barrel export optimization.
- **`expo-mobile`** (`skills/expo-mobile/`): React Native and Expo Router standards, UI-thread animations (Reanimated worklets), FlashList optimization, offline-first sync, and iOS Liquid Glass styling.
- **`web-design`** (`skills/web-design/`): Next.js App Router (RSC), strict MVC separation, Liquid Glass tokens (`GlassCard`, `GlassInput`), Lighthouse accessibility (>90), and i18n localization.

To explicitly force Pi to load a skill:
```text
/skill:nx-monorepo check dependency graph for circular references
/skill:expo-mobile optimize profile scroll performance
```

### 3. Workflow Prompts (`prompts/`)
Reusable `/` slash commands:
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
4. Submit a Pull Request.

---

## 📄 License

MIT © [Bishal Ghimire](https://github.com/bishalg)
