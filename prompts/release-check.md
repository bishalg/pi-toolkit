---
description: Verify unit tests, typechecks, linter, bundle, changelog, and git cleanliness before release
argument-hint: "[target-branch]"
---

Perform a strict pre-release validation checklist before merging or releasing to ${1:-dev or production}.

Execute and verify each of the following release gates:

### Gate 1: Git Status & Branch Hygiene

- Check `git status` to ensure all necessary changes are committed and no untracked or unwanted files (.DS_Store, temporary logs) exist.
- Verify the active branch is cleanly rebased or merged with the target branch (`${1:-dev}`).

### Gate 2: Test Suite & Coverage (TDD Gate)

- Run unit test suites for all affected packages.
- Confirm 100% test pass rate with zero skipped critical tests.
- Verify error boundaries and edge cases are validated.

### Gate 3: Type Checking & Static Analysis

- Run `tsc --noEmit` across all target projects. Ensure zero TypeScript compiler errors.
- Run project linters to ensure compliance with style rules, import restrictions, and boundary checks.

### Gate 4: Production Build & Asset Integrity

- Execute production build targets (Next.js build, Expo export, or Vite bundle).
- Verify no dynamic runtime module resolution errors, missing assets, or SSR hydration issues.

### Gate 5: Production Hygiene & Logging Verification

- Scan diff against the base branch to ensure:
  - No `console.log` or debug statements were left behind.
  - No hardcoded secrets, API tokens, or test credentials are committed.
  - No production mock data was introduced.

### Gate 6: Versioning & Changelog

- Verify `package.json` version numbers are appropriately bumped.
- Ensure `CHANGELOG.md` or release notes accurately detail all new features, bug fixes, and breaking changes.

Summarize results with a final **GO / NO-GO** release decision and clear line items for any failed gates.
