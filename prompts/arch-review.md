---
description: Conduct a deep, read-only architectural review of system topology, dependency graphs, state boundaries, and data flow
argument-hint: "[subsystem-or-path]"
---

Perform a comprehensive, read-only architectural review on ${1:-the current repository or designated subsystem}.

Analyze the architecture against enterprise-grade scalability, modularity, and maintainability standards:

### 1. Dependency Graph & Boundary Integrity

- Map cross-package and cross-module dependencies to identify boundary leaks (e.g., utility libraries importing UI layers, or core libraries importing application entry points).
- Inspect circular dependencies and barrel export trees (`index.ts`) that trigger tree-shaking failures or bundle bloat.
- Verify clear isolation between external framework adapters (Next.js, Vite, Expo) and core business domain logic.

### 2. State Boundaries & Data Flow

- Evaluate state ownership: verify whether state is centralized in predictable stores/hooks or fragmented across component trees.
- In full-stack/SSR applications, check separation between server execution (actions, DB access) and client execution (dumb view components).
- Audit offline-first resilience: verify graceful degradation, skeleton loading states, and cache revalidation strategies.

### 3. Concurrency, Lifecycle & Resource Management

- Review asynchronous execution flows for unhandled rejections, race conditions, and missing `AbortSignal` cancellation on network requests.
- Inspect persistent subscriptions (WebSockets, SSE, timers, DOM event listeners) to guarantee proper cleanup on unmount/teardown.
- Verify error boundary placement and standardized fallback behavior.

### 4. Modularity & File Size Governance

- Audit compliance with file length constraints (strict enforcement of the 800-line ceiling per file).
- Verify MVC adherence: ensure view files (`.tsx`) remain purely presentational, delegating math, data fetching, and business orchestration to hooks and controllers.

### 5. Architectural Deliverable

Present findings in a structured report formatted as:

1. **Executive Architecture Scorecard**: Overall system health, coupling score, and cohesion rating.
2. **Structural Vulnerabilities & Anti-Patterns**: Specific files and lines violating separation boundaries.
3. **Decoupling Roadmap**: Phased, non-breaking refactoring milestones to elevate architecture quality.
