---
name: sdd-methodology
description: Spec-Driven Development (SDD) methodology inspired by github/spec-kit. Guides constitution drafting, functional specifications (spec.md), architectural planning (plan.md), task breakdown (tasks.md), sequential execution, and alignment audits.
---

# Spec-Driven Development (SDD) Methodology

Spec-Driven Development enforces disciplined engineering by separating **what and why** (specification) from **how** (architecture and task breakdown) before touching any application source code.

---

## 1. The SDD Lifecycle & Phase Flow

```
[0. Constitution] ──> [1. Specify] ──> [2. Clarify] ──> [3. Plan] ──> [4. Tasks] ──> [5. Implement] ──> [6. Audit]
   (Ground Rules)      (What & Why)     (De-risk)       (How / Arch)   (Work Breakdown)   (Code Execution)     (Verify)
   [Code Locked]      [Code Locked]   [Code Locked]    [Code Locked]    [Code Locked]      [Code Unlocked]     [Code Locked]
```

### Phase Rules

1. **Phases 0 through 4 are Code-Locked**: The agent must **never** modify application files (`apps/`, `packages/`, `src/`). All writes are strictly restricted to `specs/` and `.pi/`.
2. **Phase 5 (Implement) Unlocks Code**: Code modifications begin only after `tasks.md` is approved and ordered.
3. **Phase 6 (Audit) Verifies Alignment**: Confirms that implemented code satisfies `spec.md` acceptance criteria and complies with `specs/constitution.md`.

---

## 2. Artifact Templates

### Template A: `specs/constitution.md` (Project Principles)

```markdown
# Project Constitution & Architectural Non-Negotiables

## 1. Core Principles

- [e.g. Offline-first architecture: application must function gracefully without network]
- [e.g. Test-Driven Development (TDD): write unit tests before implementation]
- [e.g. File length ceiling: strictly <800 lines per file]

## 2. Monorepo & Architectural Boundaries

- Strict MVC: View components (.tsx) are purely presentational; business logic, queries, and calculations reside in hooks and controllers.
- Package boundaries: Utility libraries must never depend on application entry points.
- Shared tokens: Consume UI tokens from core design packages with zero framework coupling.

## 3. Data & API Contracts

- Zero mock data in production builds.
- Wrap external and astronomical calculations in error boundaries.
- Strongly typed schemas (TypeBox, Zod, or TypeScript interfaces) for all boundaries.

## 4. Quality & Logging Hygiene

- Strictly NO console.log / console.error in production; use centralized platformLog.
- Accessibility & Performance minimum Lighthouse target: 90+.
- All user-facing strings must support internationalization (en, ne, hi).
```

---

### Template B: `specs/NNN-<slug>/spec.md` (Functional Specification)

> **CRITICAL RULE**: Do NOT mention frameworks, libraries, database tables, or React hooks in `spec.md`. Focus purely on user value, behaviors, and criteria.

```markdown
# Feature Specification: [Feature Title]

**Feature ID**: NNN-[feature-slug]  
**Status**: Draft | Approved  
**Created**: YYYY-MM-DD

---

## 1. Problem Statement & User Value

- **Why are we building this?** Explain the core motivation and problem being solved.
- **Target User**: Who will interact with this feature?
- **Expected Outcome**: What measurable benefit or capability does this unlock?

---

## 2. User Stories

- **US1**: As a [role], I want to [action], so that [outcome].
- **US2**: As a [role], I want to [action], so that [outcome].

---

## 3. Functional Requirements

- **FR-01**: The system must [behavior].
- **FR-02**: The system must support [capability].
- **FR-03**: When [condition occurs], the system must [action].

---

## 4. Acceptance Criteria (Given / When / Then)

### Scenario 1: [Primary Happy Path]

- **Given** [precondition]
- **When** [user or trigger action]
- **Then** [expected result]
- **And** [secondary expectation]

### Scenario 2: [Failure / Edge Case]

- **Given** [precondition or error condition]
- **When** [user action]
- **Then** [graceful fallback or message]

---

## 5. Edge Cases & Boundary Conditions

- How does the system behave when offline?
- How does the system handle corrupt, partial, or unexpected inputs?
- What happens during high-latency or timeout scenarios?

---

## 6. Non-Goals & Out of Scope

- [Explicitly list related features that are NOT part of this iteration]

---

## 7. Clarifications & Decisions (Resolved during Clarify Phase)

- **Q1**: [Question asked during clarification]
  - **Resolution**: [Accepted decision]
```

---

### Template C: `specs/NNN-<slug>/plan.md` (Technical Architecture)

````markdown
# Technical Plan: [Feature Title]

**Feature ID**: NNN-[feature-slug]  
**Aligned With**: `specs/constitution.md`

---

## 1. System Topology & Architecture

- Overview of how this feature integrates into the workspace.
- Architectural diagram or data flow (Model -> Controller/Hook -> View).

---

## 2. Affected Packages & Files

| Package / Directory | File Path                    | Action (Create / Modify / Delete) | Purpose                                |
| :------------------ | :--------------------------- | :-------------------------------- | :------------------------------------- |
| `packages/core`     | `src/types/feature.ts`       | Create                            | Domain models and validation schemas   |
| `packages/core`     | `src/services/feature.ts`    | Create                            | Business logic and calculation service |
| `apps/web`          | `src/hooks/use-feature.ts`   | Create                            | State management hook                  |
| `apps/web`          | `src/views/feature-view.tsx` | Create                            | Presentational view component          |

---

## 3. Data Models & Type Schemas

```typescript
export interface FeatureModel {
  id: string;
  name: string;
  createdAt: string;
}
```
````

---

## 4. Verification & Testing Strategy

- **Unit Tests**: Test files to create, key mock boundaries, target coverage:
  - `packages/core/src/services/feature.spec.ts`
- **Integration / UI Tests**: Component smoke tests and error boundary coverage.
- **Verification Commands**: Exact commands to run (`pnpm check`, `pnpm test`).

````

---

### Template D: `specs/NNN-<slug>/tasks.md` (Work Breakdown)
```markdown
# Work Breakdown: [Feature Title]

**Feature ID**: NNN-[feature-slug]
**Status**: Ready for Implementation

---

## Phase 1: Setup, Schemas & Domain Types
- [ ] T001 [Setup] Initialize types in `packages/core/src/types/feature.ts` (Verify: `pnpm run typecheck`)
- [ ] T002 [Setup] Add configuration tokens and validation constants (Verify: `pnpm test`)

## Phase 2: Core Domain Logic & Unit Tests (TDD)
- [ ] T003 [P] [Core] Implement test suite in `packages/core/src/services/feature.spec.ts`
- [ ] T004 [Core] Implement domain logic in `packages/core/src/services/feature.ts` (Verify: `pnpm test`)

## Phase 3: Hooks & State Controllers
- [ ] T005 [Web] Implement `useFeatureController` hook with offline fallback (Verify: `pnpm check`)

## Phase 4: UI & Views
- [ ] T006 [Web] Implement dumb view component `FeatureView.tsx` with Liquid Glass styling
- [ ] T007 [Web] Add i18n translation keys in `common/locales/shared/`

## Phase 5: Verification & Audit
- [ ] T008 [Verification] Run full test suite and quality gates (`pnpm check`)
- [ ] T009 [Audit] Run `/sdd audit` to verify against `spec.md` acceptance criteria
````

---

## 3. Execution Rules for the Agent

1. **Sequential Execution**: In Phase 5 (`implement`), work through `tasks.md` sequentially. Never jump ahead to UI before core logic tests pass.
2. **Immediate Checkmarking**: After completing a task and verifying with the specified command, update `tasks.md` by checking off `[x] T00X`.
3. **No Hallucinated Tools**: Rely on existing workspace utilities and libraries. Check `specs/constitution.md` before introducing any new dependency.

---

## 4. End-to-End Master Workflow

When building non-trivial features across the monorepo, chain the tools together in this sequence:

1. **`/grill <topic>`**:
   - Scans the repo to auto-decide ~80% of standard implementation details from existing code.
   - Asks strictly 2–3 high-impact multiple-choice questions with recommended defaults.
   - Calls `record_domain_decision` to append ubiquitous language terms to `CONTEXT.md` and save ADRs in `docs/adr/`.
2. **`/sdd specify <idea>`**:
   - Auto-increments feature folder (`specs/001-slug/`).
   - Drafts `spec.md` with user stories and Gherkin acceptance criteria (code remains locked).
3. **`/sdd clarify`**:
   - De-risks ambiguities and records agreed clarifications in `spec.md`.
4. **`/design-twice <module-description>`** _(Optional for complex interfaces)_:
   - Spawns parallel worker processes exploring Functional, Stateful, and Reactive archetypes.
   - Selects the cleanest API direction before technical planning is locked.
5. **`/sdd plan`**:
   - Formulates system topology, file paths, and data models in `plan.md` validated against `specs/constitution.md`.
6. **`/sdd tasks`**:
   - Breaks `plan.md` into atomic, checkable work items (`- [ ] T001 ...`) in `tasks.md`.
7. **`/sdd implement`** _(with `/tdd` enforcement)_:
   - Unlocks codebase writes.
   - Activate `/tdd <test-command>` for core domain logic to enforce the RED -> GREEN -> REFACTOR discipline.
   - Progressively checks off `[x] T00X` as tests pass.
8. **`/diagnose <bug>`** _(when unexpected defects arise)_:
   - Enforces the 6-step loop: Reproduce -> Minimize -> Hypothesize -> Instrument -> Fix -> Regression-Test.
   - Prohibits completion until all temporary debug probes are removed and tests pass.
9. **`/sdd audit`**:
   - Cross-checks implemented git diff against `spec.md` acceptance criteria and `specs/constitution.md`.
