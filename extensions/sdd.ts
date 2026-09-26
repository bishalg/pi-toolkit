/**
 * Spec-Driven Development (SDD) Pi Extension
 *
 * Implements the Spec-Kit methodology natively within Pi:
 * - Manages SDD phases: constitution, specify, clarify, plan, tasks, implement, audit
 * - Hard tool guardrails: Blocks write and edit calls outside 'specs/' during planning phases
 * - Auto-increments feature numbers (specs/001-slug/, specs/002-slug/)
 * - Live TUI status bar indicator reflecting active feature and code lock state
 * - Autocompletes subcommands for /sdd
 */

import fs from "node:fs";
import path from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { extractBashMutationTargets } from "./shared/exec-safe.ts";

// ---------------------------------------------------------------------------
// Types & State Definitions
// ---------------------------------------------------------------------------

export type SDDPhase =
  "idle" | "constitution" | "specify" | "clarify" | "plan" | "tasks" | "implement" | "audit";

export interface SDDState {
  activeFeature?: string;
  activeFeatureDir?: string;
  phase: SDDPhase;
  description?: string;
  totalTasks?: number;
  completedTasks?: number;
  updatedAt: string;
}

const LOCKED_PHASES = new Set<SDDPhase>([
  "constitution",
  "specify",
  "clarify",
  "plan",
  "tasks",
  "audit",
]);

const SDD_SUBCOMMANDS = [
  "constitution",
  "specify",
  "clarify",
  "plan",
  "tasks",
  "implement",
  "audit",
  "status",
  "off",
];

// ---------------------------------------------------------------------------
// Helpers: State Persistence & File System
// ---------------------------------------------------------------------------

function getStateFilePath(cwd: string): string {
  return path.join(cwd, ".pi", "sdd-state.json");
}

function loadSDDState(cwd: string): SDDState {
  try {
    const file = getStateFilePath(cwd);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      return JSON.parse(raw) as SDDState;
    }
  } catch {
    // Return default on parse failure
  }
  return { phase: "idle", updatedAt: new Date().toISOString() };
}

function saveSDDState(cwd: string, state: SDDState): void {
  try {
    const dir = path.join(cwd, ".pi");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(getStateFilePath(cwd), JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Non-fatal
  }
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getLatestFeature(cwd: string): { fullSlug: string; featureDir: string } | null {
  const specsDir = path.join(cwd, "specs");
  if (!fs.existsSync(specsDir)) return null;

  try {
    const entries = fs.readdirSync(specsDir, { withFileTypes: true });
    const featureFolders = entries
      .filter((e) => e.isDirectory() && /^\d{3}-.+$/.test(e.name))
      .map((e) => e.name)
      .sort();

    if (featureFolders.length === 0) return null;
    const latest = featureFolders[featureFolders.length - 1];
    return {
      fullSlug: latest,
      featureDir: path.join("specs", latest),
    };
  } catch {
    return null;
  }
}

function getNextFeature(
  cwd: string,
  rawTitle: string,
): { featureNum: string; featureSlug: string; fullSlug: string; featureDir: string } {
  const specsDir = path.join(cwd, "specs");
  if (!fs.existsSync(specsDir)) {
    fs.mkdirSync(specsDir, { recursive: true });
  }

  let maxNum = 0;
  try {
    const entries = fs.readdirSync(specsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const match = entry.name.match(/^(\d{3})-(.+)$/);
        if (match) {
          const num = Number.parseInt(match[1], 10);
          if (num > maxNum) maxNum = num;
        }
      }
    }
  } catch {
    maxNum = 0;
  }

  const nextNum = String(maxNum + 1).padStart(3, "0");
  const featureSlug = slugify(rawTitle) || "new-feature";
  const fullSlug = `${nextNum}-${featureSlug}`;
  const featureDir = path.join("specs", fullSlug);

  return { featureNum: nextNum, featureSlug, fullSlug, featureDir };
}

function parseTaskProgress(cwd: string, featureDir?: string): { total: number; completed: number } {
  if (!featureDir) return { total: 0, completed: 0 };
  const tasksFile = path.join(cwd, featureDir, "tasks.md");

  if (!fs.existsSync(tasksFile)) return { total: 0, completed: 0 };

  try {
    const content = fs.readFileSync(tasksFile, "utf8");
    const totalMatches = content.match(/- \[[ xX]\]/g);
    const completedMatches = content.match(/- \[[xX]\]/g);

    return {
      total: totalMatches ? totalMatches.length : 0,
      completed: completedMatches ? completedMatches.length : 0,
    };
  } catch {
    return { total: 0, completed: 0 };
  }
}

// ---------------------------------------------------------------------------
// Starter Skeletons for Specs
// ---------------------------------------------------------------------------

function getStarterConstitution(): string {
  return `# Project Constitution & Architectural Non-Negotiables

## 1. Core Engineering Principles
- Offline-first architecture: Load graceful skeleton views and handle offline states seamlessly.
- Strict MVC: View components (.tsx) are purely presentational; hooks and controllers manage business logic, data, and calculations.
- File limits: Strictly <800 lines per file.

## 2. Monorepo & Boundary Rules
- Utility and core packages must never import from application entry points.
- Shared tokens: All components consume design tokens from core packages without framework lock-in.

## 3. Data & Diagnostics
- Zero mock data in production paths.
- Zero console.log or console.error in production; use centralized platformLog.
- Minimum Lighthouse Accessibility & Performance score > 90.
`;
}

function getStarterSpec(title: string, slug: string): string {
  return `# Feature Specification: ${title}

**Feature ID**: ${slug}  
**Status**: Draft  
**Created**: ${new Date().toISOString().split("T")[0]}  

---

## 1. Problem Statement & User Value
- **Why are we building this?**
- **Target User**:
- **Expected Outcome**:

---

## 2. User Stories
- **US1**: As a [role], I want to [action], so that [outcome].

---

## 3. Functional Requirements
- **FR-01**: The system must [behavior].
- **FR-02**: The system must support [capability].

---

## 4. Acceptance Criteria (Given / When / Then)
### Scenario 1: [Primary Happy Path]
- **Given** [precondition]
- **When** [trigger event]
- **Then** [expected result]

---

## 5. Edge Cases & Boundary Conditions
- Offline behavior:
- Error recovery:

---

## 6. Non-Goals & Out of Scope
- [Items explicitly excluded from this iteration]

---

## 7. Clarifications & Decisions
- [Decisions resolved during clarify phase]
`;
}

// ---------------------------------------------------------------------------
// Extension Factory
// ---------------------------------------------------------------------------

export default function sddExtension(pi: ExtensionAPI): void {
  // Update TUI Status Bar
  function updateTUI(ctx: ExtensionContext, state: SDDState): void {
    if (!ctx.hasUI) return;

    if (state.phase === "idle") {
      ctx.ui.setStatus("sdd", undefined);
      return;
    }

    if (state.phase === "implement") {
      const progress = parseTaskProgress(ctx.cwd, state.activeFeatureDir);
      state.totalTasks = progress.total;
      state.completedTasks = progress.completed;
      ctx.ui.setStatus(
        "sdd",
        ctx.ui.theme.fg(
          "success",
          `SDD: ${state.activeFeature ?? "feature"} [IMPLEMENT - ${progress.completed}/${progress.total} Tasks]`,
        ),
      );
    } else {
      ctx.ui.setStatus(
        "sdd",
        ctx.ui.theme.fg(
          "warning",
          `SDD: ${state.activeFeature ?? "project"} [${state.phase.toUpperCase()} - Code Locked]`,
        ),
      );
    }
  }

  // 0. Session Start: Restore TUI status
  pi.on("session_start", async (_event, ctx) => {
    const state = loadSDDState(ctx.cwd);
    updateTUI(ctx, state);
  });

  // 1. Tool Call Interceptor: Hard Guardrail Against Writing Application Code
  pi.on("tool_call", async (event, ctx) => {
    const state = loadSDDState(ctx.cwd);

    if (state.phase === "idle" || state.phase === "implement") {
      // In idle or implement phase, normal codebase edits are allowed
      return undefined;
    }

    if (LOCKED_PHASES.has(state.phase)) {
      if (event.toolName === "write" || event.toolName === "edit") {
        const input = event.input as Record<string, unknown> | undefined;
        const targetPath = (
          typeof input?.path === "string"
            ? input.path
            : typeof input?.file_path === "string"
              ? input.file_path
              : ""
        ) as string;

        if (!targetPath) return undefined;

        const resolved = path.resolve(ctx.cwd, targetPath);
        const rel = path.relative(ctx.cwd, resolved).replace(/\\/g, "/");

        const isSpecPath = rel === "specs" || rel.startsWith("specs/");
        const isPiPath = rel === ".pi" || rel.startsWith(".pi/");

        if (!isSpecPath && !isPiPath) {
          if (ctx.hasUI) {
            ctx.ui.notify(
              `🔒 SDD Enforcement: Code editing locked during '${state.phase}'. Only 'specs/' allowed.`,
              "error",
            );
          }

          return {
            block: true,
            reason:
              `[SDD Enforcement] Code modifications are locked in '${state.phase}' phase. ` +
              `You are in Spec-Driven Development mode (${state.activeFeature ?? "feature"}). ` +
              `Only files inside 'specs/' (and '.pi/') may be written or edited during this phase. ` +
              `Complete the specification, planning, and task breakdown, then have the user run '/sdd implement' to unlock codebase edits.`,
          };
        }
      }

      // Guard against mutating application code via bash (redirection, tee, sed -i, rm, mv)
      if (event.toolName === "bash") {
        const input = event.input as Record<string, unknown> | undefined;
        const cmd = (typeof input?.command === "string" ? input.command : "").trim();
        const targets = extractBashMutationTargets(cmd);

        for (const rawTarget of targets) {
          const target = rawTarget.replace(/\\/g, "/");
          if (target === "/dev/null") continue;

          const isSpec =
            target === "specs" || target.startsWith("specs/") || target.startsWith("./specs/");
          const isPi = target === ".pi" || target.startsWith(".pi/") || target.startsWith("./.pi/");

          if (!isSpec && !isPi) {
            if (ctx.hasUI) {
              ctx.ui.notify(
                `🔒 SDD Enforcement: Bash file mutation outside 'specs/' is locked in '${state.phase}'.`,
                "error",
              );
            }
            return {
              block: true,
              reason:
                `[SDD Enforcement] Bash command attempts to modify '${target}' outside 'specs/'. ` +
                `In '${state.phase}' phase, code modifications are locked. Only files inside 'specs/' are allowed.`,
            };
          }
        }
      }
    }

    return undefined;
  });

  // 2. Register Slash Command /sdd
  pi.registerCommand("sdd", {
    description:
      "Spec-Driven Development manager: /sdd [constitution|specify|clarify|plan|tasks|implement|audit|status|off]",

    getArgumentCompletions: (prefix: string) => {
      const filtered = SDD_SUBCOMMANDS.filter((cmd) => cmd.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((c) => ({ value: c, label: c })) : null;
    },

    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      const trimmed = rawArgs.trim();
      const parts = trimmed.split(/\s+/);
      const subcommand = (parts[0] || "").toLowerCase();
      const rest = parts.slice(1).join(" ").trim();

      const state = loadSDDState(ctx.cwd);

      // If activeFeature is missing, try to auto-adopt latest from specs/
      if (!state.activeFeature) {
        const latest = getLatestFeature(ctx.cwd);
        if (latest) {
          state.activeFeature = latest.fullSlug;
          state.activeFeatureDir = latest.featureDir;
        }
      }

      // Handler: /sdd constitution
      if (subcommand === "constitution") {
        const specsDir = path.join(ctx.cwd, "specs");
        if (!fs.existsSync(specsDir)) fs.mkdirSync(specsDir, { recursive: true });

        const constitutionPath = path.join(specsDir, "constitution.md");
        if (!fs.existsSync(constitutionPath)) {
          fs.writeFileSync(constitutionPath, getStarterConstitution(), "utf8");
        }

        state.phase = "constitution";
        saveSDDState(ctx.cwd, state);
        updateTUI(ctx, state);

        const prompt =
          `### 🏛️ SDD Phase: Constitution (Ground Rules)\n\n` +
          `You are in the **Constitution** phase of Spec-Driven Development.\n` +
          `Inspect the workspace repository and refine \`specs/constitution.md\` following \`/skill:sdd-methodology\`.\n` +
          `- Document architectural non-negotiables, monorepo boundaries, testing standards, and forbidden patterns.\n` +
          `- **Notice**: Application code writes outside \`specs/\` are locked.`;

        if (pi.sendMessage) {
          pi.sendMessage({ customType: "sdd-prompt", content: prompt, display: true });
        } else {
          ctx.ui.notify(
            "SDD Phase: CONSTITUTION. Review and update specs/constitution.md.",
            "info",
          );
        }
        return;
      }

      // Handler: /sdd specify <description>
      if (subcommand === "specify") {
        let title = rest;
        if (!title && ctx.hasUI) {
          title =
            (await ctx.ui.input("Enter feature description (e.g. Offline Sync for Vastu):")) || "";
        }

        if (!title) {
          ctx.ui.notify(
            "Please provide a feature description: /sdd specify <feature-description>",
            "warning",
          );
          return;
        }

        const { fullSlug, featureDir } = getNextFeature(ctx.cwd, title);
        const absDir = path.join(ctx.cwd, featureDir);
        if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });

        const specFile = path.join(absDir, "spec.md");
        if (!fs.existsSync(specFile)) {
          fs.writeFileSync(specFile, getStarterSpec(title, fullSlug), "utf8");
        }

        state.activeFeature = fullSlug;
        state.activeFeatureDir = featureDir;
        state.phase = "specify";
        state.description = title;
        saveSDDState(ctx.cwd, state);
        updateTUI(ctx, state);

        const prompt =
          `### 📝 SDD Phase: Specify (What & Why)\n\n` +
          `**Active Feature**: \`${fullSlug}\`\n` +
          `**Description**: ${title}\n` +
          `**Target Artifact**: \`${featureDir}/spec.md\`\n\n` +
          `Draft the functional specification following \`/skill:sdd-methodology\`:\n` +
          `1. Write user stories, functional requirements, and Given/When/Then acceptance criteria.\n` +
          `2. Identify edge cases, boundary conditions, and non-goals.\n` +
          `3. **CRITICAL**: Do NOT include tech stack details, specific hooks, or database queries.\n` +
          `4. Application code edits outside \`specs/\` are locked.`;

        if (pi.sendMessage) {
          pi.sendMessage({ customType: "sdd-prompt", content: prompt, display: true });
        } else {
          ctx.ui.notify(`SDD Phase: SPECIFY. Drafting ${featureDir}/spec.md`, "info");
        }
        return;
      }

      // Handler: /sdd clarify
      if (subcommand === "clarify") {
        if (!state.activeFeature || !state.activeFeatureDir) {
          ctx.ui.notify(
            "No active feature found. Run '/sdd specify <description>' first.",
            "warning",
          );
          return;
        }

        state.phase = "clarify";
        saveSDDState(ctx.cwd, state);
        updateTUI(ctx, state);

        const prompt =
          `### 🔍 SDD Phase: Clarify (De-risking)\n\n` +
          `**Active Feature**: \`${state.activeFeature}\`\n` +
          `**Target Spec**: \`${state.activeFeatureDir}/spec.md\`\n\n` +
          `Audit the functional spec for ambiguities, missing edge cases, or underspecified requirements:\n` +
          `1. Ask up to 5 structured questions with multiple-choice options or short answers.\n` +
          `2. Update \`${state.activeFeatureDir}/spec.md\` under 'Clarifications & Decisions' with the agreed answers.\n` +
          `3. Application code edits outside \`specs/\` remain locked.`;

        if (pi.sendMessage) {
          pi.sendMessage({ customType: "sdd-prompt", content: prompt, display: true });
        } else {
          ctx.ui.notify("SDD Phase: CLARIFY. Auditing spec for ambiguities.", "info");
        }
        return;
      }

      // Handler: /sdd plan
      if (subcommand === "plan") {
        if (!state.activeFeature || !state.activeFeatureDir) {
          ctx.ui.notify(
            "No active feature found. Run '/sdd specify <description>' first.",
            "warning",
          );
          return;
        }

        state.phase = "plan";
        saveSDDState(ctx.cwd, state);
        updateTUI(ctx, state);

        const prompt =
          `### 📐 SDD Phase: Plan (Technical Blueprint)\n\n` +
          `**Active Feature**: \`${state.activeFeature}\`\n` +
          `**Target Plan**: \`${state.activeFeatureDir}/plan.md\`\n\n` +
          `Formulate the architectural plan in \`${state.activeFeatureDir}/plan.md\` following \`/skill:sdd-methodology\`:\n` +
          `1. Cross-check against \`specs/constitution.md\` (architectural boundaries & constraints).\n` +
          `2. Define affected packages, file paths to create/modify, data schemas, and contracts.\n` +
          `3. Establish the verification and testing strategy (unit test paths, coverage goals).\n` +
          `4. Application code edits outside \`specs/\` remain locked.`;

        if (pi.sendMessage) {
          pi.sendMessage({ customType: "sdd-prompt", content: prompt, display: true });
        } else {
          ctx.ui.notify(`SDD Phase: PLAN. Generating ${state.activeFeatureDir}/plan.md`, "info");
        }
        return;
      }

      // Handler: /sdd tasks
      if (subcommand === "tasks") {
        if (!state.activeFeature || !state.activeFeatureDir) {
          ctx.ui.notify(
            "No active feature found. Run '/sdd specify <description>' first.",
            "warning",
          );
          return;
        }

        state.phase = "tasks";
        saveSDDState(ctx.cwd, state);
        updateTUI(ctx, state);

        const prompt =
          `### 📋 SDD Phase: Tasks Breakdown\n\n` +
          `**Active Feature**: \`${state.activeFeature}\`\n` +
          `**Target Tasks**: \`${state.activeFeatureDir}/tasks.md\`\n\n` +
          `Convert \`${state.activeFeatureDir}/plan.md\` into atomic, sequential tasks:\n` +
          `1. Format each item as \`- [ ] T001 [Package/Phase] Description (Verify: command)\`.\n` +
          `2. Group tasks logically: Setup -> Domain Logic (TDD) -> Controllers/Hooks -> Views -> Verification.\n` +
          `3. Mark parallelizable tasks with \`[P]\`.\n` +
          `4. Codebase writes remain locked until '/sdd implement'.`;

        if (pi.sendMessage) {
          pi.sendMessage({ customType: "sdd-prompt", content: prompt, display: true });
        } else {
          ctx.ui.notify(`SDD Phase: TASKS. Generating ${state.activeFeatureDir}/tasks.md`, "info");
        }
        return;
      }

      // Handler: /sdd implement
      if (subcommand === "implement") {
        if (!state.activeFeature || !state.activeFeatureDir) {
          ctx.ui.notify(
            "No active feature found. Run '/sdd specify <description>' first.",
            "warning",
          );
          return;
        }

        state.phase = "implement";
        const progress = parseTaskProgress(ctx.cwd, state.activeFeatureDir);
        state.totalTasks = progress.total;
        state.completedTasks = progress.completed;
        saveSDDState(ctx.cwd, state);
        updateTUI(ctx, state);

        ctx.ui.notify("🔓 SDD Phase: IMPLEMENT. Code modifications unlocked!", "info");

        const prompt =
          `### ⚡ SDD Phase: Implement (Execution)\n\n` +
          `**Active Feature**: \`${state.activeFeature}\`\n` +
          `**Tasks File**: \`${state.activeFeatureDir}/tasks.md\`\n` +
          `**Progress**: ${progress.completed}/${progress.total} tasks completed\n\n` +
          `🔓 **Code modifications are now UNLOCKED across the workspace.**\n` +
          `Execute the tasks in \`${state.activeFeatureDir}/tasks.md\` sequentially:\n` +
          `1. Pick the next uncompleted task \`- [ ] T00X\`.\n` +
          `2. Implement code changes and execute the verification step.\n` +
          `3. Mark task complete by checking \`- [x] T00X\` in \`${state.activeFeatureDir}/tasks.md\`.\n` +
          `4. Proceed until all tasks are marked complete.`;

        if (pi.sendMessage) {
          pi.sendMessage({ customType: "sdd-prompt", content: prompt, display: true });
        }
        return;
      }

      // Handler: /sdd audit
      if (subcommand === "audit") {
        if (!state.activeFeature || !state.activeFeatureDir) {
          ctx.ui.notify(
            "No active feature found. Run '/sdd specify <description>' first.",
            "warning",
          );
          return;
        }

        state.phase = "audit";
        saveSDDState(ctx.cwd, state);
        updateTUI(ctx, state);

        const prompt =
          `### 🛡️ SDD Phase: Audit & Verification\n\n` +
          `**Active Feature**: \`${state.activeFeature}\`\n` +
          `Cross-check the implemented code against:\n` +
          `1. Acceptance Criteria in \`${state.activeFeatureDir}/spec.md\`\n` +
          `2. Architecture principles in \`specs/constitution.md\`\n` +
          `3. Git changes (\`git diff\`)\n\n` +
          `Produce an alignment report summarizing verified criteria and any remaining items.`;

        if (pi.sendMessage) {
          pi.sendMessage({ customType: "sdd-prompt", content: prompt, display: true });
        } else {
          ctx.ui.notify("SDD Phase: AUDIT. Verifying spec compliance.", "info");
        }
        return;
      }

      // Handler: /sdd off | /sdd exit
      if (subcommand === "off" || subcommand === "exit") {
        state.phase = "idle";
        saveSDDState(ctx.cwd, state);
        updateTUI(ctx, state);
        ctx.ui.notify("SDD mode disabled. Returned to idle.", "info");
        return;
      }

      // Handler: /sdd status (or default)
      const progress = parseTaskProgress(ctx.cwd, state.activeFeatureDir);
      const isLocked = LOCKED_PHASES.has(state.phase);

      const statusMsg =
        `### 📊 Spec-Driven Development (SDD) Status\n\n` +
        `• **Active Feature**: \`${state.activeFeature ?? "None"}\`\n` +
        `• **Current Phase**: \`${state.phase.toUpperCase()}\`\n` +
        `• **Code Lock**: ${isLocked ? "🔒 Locked (Only specs/ permitted)" : "🔓 Unlocked"}\n` +
        `• **Tasks**: ${progress.completed}/${progress.total} completed\n` +
        `• **Feature Dir**: \`${state.activeFeatureDir ?? "None"}\`\n\n` +
        `**Commands**: \`/sdd [constitution|specify|clarify|plan|tasks|implement|audit|status|off]\``;

      updateTUI(ctx, state);

      if (pi.sendMessage) {
        pi.sendMessage({ customType: "sdd-status", content: statusMsg, display: true });
      } else {
        ctx.ui.notify(
          `SDD [${state.phase.toUpperCase()}]: Feature=${state.activeFeature ?? "None"} (${progress.completed}/${progress.total} tasks)`,
          "info",
        );
      }
    },
  });
}
