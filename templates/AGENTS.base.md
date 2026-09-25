# AGENTS.md (Baseline Organization Template)

> This document defines non-negotiable architectural rules, git safety protocols, and coding standards for all AI coding agents working in this repository.

---

## 1. Non-Negotiable Git Safety & Working Tree Invariants

- **Branching Policy**: Always work on the designated development branch (`dev` or an explicit feature branch). Never switch branches unexpectedly or commit directly to locked production branches (`main` / `master`) without review.
- **Zero Data Loss Commands**: Destructive git commands are **strictly prohibited**:
  - ❌ `git reset --hard`
  - ❌ `git clean -fd`
  - ❌ `git checkout .` / `git restore .` (unless explicitly instructed for a specific file)
  - ❌ `git stash drop`
- **Conflict Prevention**: Never run background `git pull` or `git rebase` during active file edits. Verify `git diff --check` has zero merge conflict markers before finishing any task.

---

## 2. Architecture: Strict MVC & Dumb Views

- **View Layer**: Views (`.tsx`, `.jsx`, `.vue`) must be purely presentational ("dumb" views).
  - Target size: `<500` lines ideal, `800` lines absolute hard limit.
  - Zero embedded database queries, external network fetching, or complex domain mathematics inside view components.
- **Model / Controller Layer**:
  - Extract all state machines, caching, and data operations into dedicated hooks (`use*.ts`), service modules, or server actions.
  - Wrap third-party network calls and native calculations in robust error boundaries.

---

## 3. Code Quality, File Limits & Logging

- **File Length Limit**: Strictly maximum 800 lines per file. Break large files down into focused, modular sub-components and utilities.
- **Zero Production Console Logs**: Strictly NO `console.log`, `console.warn`, or `console.error` in production-ready code. Use the centralized diagnostic logging utility (`platformLog` or equivalent).
- **No Mock Data in Production**: Production builds must never use hardcoded mock responses. Handle loading, offline, and error states gracefully with skeleton cards.

---

## 4. Test-Driven Development (TDD) & Quality Verification

- **TDD Protocol**: Write unit tests alongside or before new implementations.
- **Pre-Commit Verification**: Run project type checks (`tsc --noEmit`), linters, and formatters before completing any task.
- **Zero Broken Tests**: Never leave the repository with failing tests. Fix or mock properly according to established test guidelines.

---

## 5. Security & Secret Hygiene

- **Zero Credential Exposure**: Never commit API keys, bearer tokens, passwords, private SSH keys, or staging database credentials.
- **Safe Process Invocation**: All script executions must use `shell: false` or discrete argument arrays to prevent shell injection vulnerabilities.
