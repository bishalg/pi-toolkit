---
name: nx-monorepo
description: Enterprise Nx monorepo architecture, project boundaries, computation caching, dependency graphs, and multi-package workflows. Use when working in an Nx workspace, debugging build graphs, running affected commands, or enforcing strict module boundaries.
license: MIT
---

# Nx Monorepo Engineering Skill

This skill guides Pi on best practices, commands, and architectural constraints when navigating, modifying, or testing code within an **Nx Monorepo**.

---

## 1. Core Monorepo Principles

1. **Single Source of Truth**: All configuration, linting rules, and TypeScript path mappings should originate from centralized workspace configurations (e.g. `tsconfig.base.json` or `config/tsconfig.paths.json`).
2. **Strict Module Boundaries**: Never allow circular dependencies or cross-boundary imports that bypass project scopes.
3. **Computation Caching**: Leverage Nx's input/output hash caching. Avoid unnecessary cache busting or manual file copies that bypass Nx targets.
4. **Isolated Project Targets**: Each app and package defines its own targets (`build`, `test`, `lint`, `serve`) within `project.json` or package-level `package.json`.

---

## 2. Project Boundary & Tagging Taxonomy

All projects should declare tags in their `project.json` to enforce architectural constraints with `@nx/enforce-module-boundaries`:

### Tag Dimensions
- **`scope:<domain>`**: Identifies the business or functional domain (e.g., `scope:core`, `scope:auth`, `scope:shared`, `scope:mobile`).
- **`type:<layer>`**: Identifies the architectural layer:
  - `type:app`: Top-level runnable applications (Next.js, Expo).
  - `type:feature`: Domain-specific business logic and smart screens/pages.
  - `type:ui`: Dumb, presentational components (design system tokens, cards, buttons).
  - `type:data-access`: State machines, API clients, hooks, database connectors.
  - `type:util`: Pure functions, mathematical algorithms, astronomy engines.

### Dependency Flow Matrix
- `type:app` ➔ `type:feature`, `type:ui`, `type:data-access`, `type:util`
- `type:feature` ➔ `type:ui`, `type:data-access`, `type:util`
- `type:ui` ➔ `type:util` (no feature or data-access dependencies)
- `type:data-access` ➔ `type:util`
- `type:util` ➔ pure leaf packages only

---

## 3. Safe Path Mapping & Barrel Stripping

### Centralized TypeScript Paths
Always import workspace packages via their declared TypeScript path aliases:
```typescript
// ✅ Good: Centralized module path alias
import { GlassCard } from "@myorg/design-language-core";
import { calculateEphemeris } from "@myorg/astronomy-engine";

// ❌ Bad: Relative boundary breach
import { GlassCard } from "../../../packages/design-language-core/src/components/GlassCard";
```

### Barrel Stripping & Native Isolation
Avoid importing from giant root barrels (`index.ts`) if they re-export heavy native modules (e.g. WASM, native C++ bindings, or heavy UI libraries).
- Provide explicit subpath exports in `package.json`:
  ```json
  "exports": {
    ".": "./src/index.ts",
    "./tokens": "./src/tokens/index.ts",
    "./wasm": "./src/wasm/index.ts"
  }
  ```
- This prevents bundle bloat and Turbopack/Webpack SSR build failures.

---

## 4. Essential Nx CLI Commands

Always run Nx commands from the workspace root using `npx nx`:

### Impacted / Affected Workflows
```bash
# Run tests only on projects affected by changes relative to main/dev
npx nx affected --target=test --base=origin/dev --head=HEAD

# Lint all affected projects
npx nx affected --target=lint --base=origin/dev --head=HEAD

# Build all affected targets
npx nx affected --target=build --base=origin/dev --head=HEAD
```

### Multi-Project Target Execution
```bash
# Run tests across all workspace packages
npx nx run-many --target=test --all --parallel=3

# Build specific projects
npx nx run-many --target=build --projects=web-app,mobile-app
```

### Dependency Graph & Troubleshooting
```bash
# Generate visual project graph
npx nx graph

# Print graph dependencies in JSON format for scripting
npx nx graph --file=dist/graph.json

# Reset local Nx daemon and computation cache when encountering stale states
npx nx reset
```

---

## 5. Agent Verification Checklist

Before completing any monorepo task:
- [ ] Run `npx nx affected -t lint` to ensure no module boundary violations were introduced.
- [ ] Run `npx nx affected -t test` to verify unit test coverage remains passing.
- [ ] Confirm no relative path traversals (`../../`) cross package boundaries.
- [ ] Verify no secrets or sensitive environment variables were committed.
