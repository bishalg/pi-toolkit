---
description: Summarize active session state, pending tasks, modified files, and produce a clean compaction and handoff report
argument-hint: "[target-branch-or-engineer]"
---

Generate a comprehensive session handoff and context compaction report for ${1:-the next engineer or agent session}.

Inspect the git status, recent diffs, and context to produce a structured handoff document containing:

### 1. Objective & Session Context

- State the original user request and primary problem statement.
- Detail the target scope, key design decisions, and architectural rationale established during the session.

### 2. Git & Workspace State

- **Active Branch**: Specify current branch and target merge branch.
- **Changed Files**: Enumerate modified, added, and deleted files with clickable markdown links (`[file.ts](file:///...)`).
- **Uncommitted Changes**: Highlight any pending work in the working tree or staging index.

### 3. Verification & Quality Gate Results

- **Typecheck**: Status of `tsc --noEmit` or equivalent compiler checks.
- **Lint & Format**: Status of ESLint and Prettier checks.
- **Automated Tests**: Test suite coverage and execution results.
- **Manual Verification**: Runtime or browser testing steps verified.

### 4. Remaining Tasks & Roadmap

- Provide an ordered checklist of outstanding tasks (`- [ ]`) necessary to complete the feature or bug fix.
- Document any known trade-offs, edge cases, technical debt, or temporary workarounds introduced.

### 5. Resumption Instructions

- Supply exact terminal commands and steps for the next session or developer to pick up immediately without losing context.
