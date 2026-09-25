---
description: Inspect repository structure and scaffold a tailored AGENTS.md, skill recommendations, and quality gates
argument-hint: "[project-type-or-notes]"
---

Scan the current workspace and bootstrap a standardized agent configuration:

1. **Repository Discovery**:
   - Inspect `package.json` dependencies, directory layout, and tooling (Nx, Vite, Next.js, Expo, Turborepo, Vitest/Jest).
   - Identify active frameworks, build targets, and mobile/web runtimes.

2. **Generate Tailored `AGENTS.md`**:
   - Using the organization's base standards, generate a tailored `AGENTS.md` at the project root.
   - Codify non-negotiable git safety rules (work on `dev`, no destructive commands).
   - Codify strict MVC boundaries and file length thresholds (max 800 lines).
   - Codify logging hygiene (zero raw `console.log` in production).

3. **Recommend & Link `pi-toolkit` Skills**:
   - Analyze which `pi-toolkit` skills apply to this project:
     - `tanstack-vite` for Vite SPAs & TanStack Router.
     - `nx-monorepo` for Nx multi-package workspaces.
     - `expo-mobile` for React Native & Expo applications.
     - `web-design` for Liquid Glass styling and dumb-view MVC.
     - `antigravity` for background agent delegation and model queries.

4. **Verify Quality Gates**:
   - Check if Husky, lint-staged, TypeScript type checks, and ESLint configs are in place.
   - Propose pre-commit gates to prevent unlinted or broken code from being pushed.
