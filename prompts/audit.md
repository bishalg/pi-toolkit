---
description: Audit codebase for architecture boundaries, type safety, security, logging, and performance
argument-hint: "[path-or-scope]"
---
Perform a thorough, multi-dimensional code audit on ${1:-the current repository or staged changes}.

Analyze the target against the following enterprise standards and output findings in a prioritized report:

### 1. Architectural Boundaries & Monorepo Health
- Verify module boundary constraints (e.g. apps depending on features/UI/utils; utils never depending on apps).
- Flag any relative imports traversing across package boundaries (e.g. `../../packages/` instead of tsconfig aliases).
- Check for barrel export issues that could cause bundle bloat or SSR leakage.

### 2. Type Safety & Code Quality
- Inspect TypeScript compliance; flag improper `any` casts or missing error handling.
- Verify file length: Flag any file approaching or exceeding the 800-line threshold.
- Check strict MVC separation: Ensure view components (`.tsx`) do not contain inline database queries or heavy mathematical calculations.

### 3. Security & Secret Leakage
- Scan for accidental exposure of secrets, bearer tokens, private keys, or credentials.
- Verify safe process execution (no unescaped shell string interpolation).

### 4. Logging & Diagnostics
- Verify zero production `console.log` or `console.error` calls. Confirm usage of the centralized diagnostic logger (`platformLog`).
- Ensure no mock data is lingering in production paths.

### 5. UI/UX, Design System & Accessibility
- Check adherence to the Liquid Glass design language (standardized border radius, blur, transparency tokens).
- Verify semantic HTML, single `<h1>` hierarchy, and accessibility attributes.
- Ensure all user-facing strings are localized via translation functions.

Output the audit results in a structured markdown summary with:
1. **Critical Issues**: Immediate blockers requiring fixes.
2. **Warnings & Code Smells**: Best-practice improvements.
3. **Actionable Checklist**: Direct instructions for remediation.
