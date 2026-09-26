/**
 * TDD (Red-Green-Refactor) Hard-Gated Pi Extension
 *
 * Enforces test-driven development:
 * - RED phase: Locks application source code; only test files (*.test.*, *.spec.*) can be edited.
 * - Tool 'verify_tdd_step': Runs test runner. Transitions to GREEN only if the test fails.
 * - GREEN phase: Locks test files and unlocks source files until the test passes.
 * - REFACTOR phase: Unlocks both source and test files for clean up, verifying tests stay green.
 * - Live TUI status bar reflects active phase.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { resolveBinary, runSafeProcess } from "./shared/exec-safe.js";

// ---------------------------------------------------------------------------
// Types & State
// ---------------------------------------------------------------------------

export type TDDPhase = "idle" | "red" | "green" | "refactor";

export interface TDDState {
  phase: TDDPhase;
  testCommand: string;
  testFile?: string;
  cyclesCompleted: number;
  updatedAt: string;
}

const TEST_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$|(^|\/)__tests__\//i;

function getStateFilePath(cwd: string): string {
  return path.join(cwd, ".pi", "tdd-state.json");
}

function loadTDDState(cwd: string): TDDState {
  try {
    const file = getStateFilePath(cwd);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8")) as TDDState;
    }
  } catch {
    // Default fallback
  }
  return {
    phase: "idle",
    testCommand: "pnpm test",
    cyclesCompleted: 0,
    updatedAt: new Date().toISOString(),
  };
}

function saveTDDState(cwd: string, state: TDDState): void {
  try {
    const dir = path.join(cwd, ".pi");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(getStateFilePath(cwd), JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Non-fatal
  }
}

function isTestFilePath(targetPath: string): boolean {
  return TEST_FILE_PATTERN.test(targetPath);
}

// ---------------------------------------------------------------------------
// Tool Parameter Schema
// ---------------------------------------------------------------------------

export const VerifyTddStepParams = Type.Object({
  customCommand: Type.Optional(
    Type.String({
      description:
        "Optional test command override (e.g. 'pnpm test packages/core/src/service.spec.ts').",
    }),
  ),
  testFile: Type.Optional(
    Type.String({
      description: "Path to the specific test file being targeted in this cycle.",
    }),
  ),
});

export type VerifyTddStepInput = Static<typeof VerifyTddStepParams>;

export interface VerifyTddStepDetails {
  phaseBefore: TDDPhase;
  phaseAfter: TDDPhase;
  exitCode: number;
  command: string;
  cyclesCompleted: number;
}

// ---------------------------------------------------------------------------
// Extension Factory
// ---------------------------------------------------------------------------

export default function tddExtension(pi: ExtensionAPI): void {
  function updateTUI(ctx: ExtensionContext, state: TDDState): void {
    if (!ctx.hasUI) return;

    if (state.phase === "idle") {
      ctx.ui.setStatus("tdd", undefined);
      return;
    }

    if (state.phase === "red") {
      ctx.ui.setStatus(
        "tdd",
        ctx.ui.theme.fg(
          "error",
          `🔴 TDD: RED (Write Failing Test - Cycle ${state.cyclesCompleted + 1})`,
        ),
      );
    } else if (state.phase === "green") {
      ctx.ui.setStatus(
        "tdd",
        ctx.ui.theme.fg(
          "success",
          `🟢 TDD: GREEN (Make Test Pass - Cycle ${state.cyclesCompleted + 1})`,
        ),
      );
    } else if (state.phase === "refactor") {
      ctx.ui.setStatus(
        "tdd",
        ctx.ui.theme.fg(
          "accent",
          `🔵 TDD: REFACTOR (Clean Up - Cycle ${state.cyclesCompleted + 1})`,
        ),
      );
    }
  }

  // 1. Hard Tool Guardrails
  pi.on("tool_call", async (event, ctx) => {
    const state = loadTDDState(ctx.cwd);
    if (state.phase === "idle") return undefined;

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

      const isTest = isTestFilePath(targetPath);
      const isPiConfig = targetPath.startsWith(".pi/") || targetPath.includes("/.pi/");

      if (isPiConfig) return undefined;

      // In RED phase: Only test files can be modified
      if (state.phase === "red" && !isTest) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `🔴 TDD RED: Writing application code locked. Only test files (*.spec.*, *.test.*) allowed.`,
            "error",
          );
        }
        return {
          block: true,
          reason:
            `[TDD RED Phase] Writing application code is blocked. You must first write or update a test file ` +
            `(*.spec.ts, *.test.ts) that fails, then call 'verify_tdd_step' to confirm the failure before implementing.`,
        };
      }

      // In GREEN phase: Test files are locked (cannot alter tests to cheat)
      if (state.phase === "green" && isTest) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            `🟢 TDD GREEN: Test files are locked. Implement application source code to make tests pass.`,
            "error",
          );
        }
        return {
          block: true,
          reason:
            `[TDD GREEN Phase] Modifying test files is locked. You must make the existing test pass ` +
            `by implementing application source code, then call 'verify_tdd_step' to confirm tests pass.`,
        };
      }
    }

    return undefined;
  });

  // 2. Register Tool: verify_tdd_step
  pi.registerTool({
    name: "verify_tdd_step",
    label: "Verify TDD Step",
    description:
      "Executes test suite and manages TDD state transitions (RED -> GREEN -> REFACTOR). In RED, requires test failure. In GREEN, requires test pass.",
    promptSnippet: "Execute test command and advance TDD phase",
    promptGuidelines: [
      "In RED phase: Call after writing a new test. Verifies test fails and advances to GREEN.",
      "In GREEN phase: Call after implementing code. Verifies test passes and advances to REFACTOR.",
      "In REFACTOR phase: Call to verify code cleanup didn't break tests.",
    ],
    parameters: VerifyTddStepParams,
    async execute(
      _toolCallId,
      params,
      signal,
      onUpdate,
      ctx,
    ): Promise<AgentToolResult<VerifyTddStepDetails>> {
      const state = loadTDDState(ctx.cwd);
      if (state.phase === "idle") {
        throw new Error("TDD mode is not active. Enable it first via /tdd <test-command>.");
      }

      if (params.testFile) state.testFile = params.testFile;
      const cmd = params.customCommand || state.testCommand;

      if (onUpdate) {
        onUpdate({
          content: [{ type: "text", text: `Running TDD verification: \`${cmd}\`...` }],
          details: {
            phaseBefore: state.phase,
            phaseAfter: state.phase,
            exitCode: -1,
            command: cmd,
            cyclesCompleted: state.cyclesCompleted,
          },
        });
      }

      // Execute test command safely
      const parts = cmd.trim().split(/\s+/);
      const binary = parts[0];
      const args = parts.slice(1);

      const raw = await runSafeProcess({
        binaryPath: resolveBinary(binary) || binary,
        args,
        cwd: ctx.cwd,
        timeoutSeconds: 120,
        signal,
      });

      const phaseBefore = state.phase;
      let phaseAfter = state.phase;
      let message = "";

      const outputPreview = (raw.stdout + "\n" + raw.stderr).trim().slice(-1500);

      if (phaseBefore === "red") {
        if (raw.exitCode !== 0) {
          // Expected failure in RED phase!
          phaseAfter = "green";
          state.phase = "green";
          saveTDDState(ctx.cwd, state);
          updateTUI(ctx, state);

          message =
            `✅ **TDD RED Verified**: Test failed as expected (Exit code: ${raw.exitCode}).\n` +
            `🟢 **Phase Transition**: Advanced to **GREEN**.\n\n` +
            `**Next Step**: Test files are now frozen. Write the minimal application source code to make this test pass, then call \`verify_tdd_step\`.\n\n` +
            `\`\`\`text\n${outputPreview}\n\`\`\``;
        } else {
          // Unexpected pass in RED phase
          message =
            `❌ **TDD RED Violation**: Test passed unexpectedly (Exit code: 0).\n` +
            `In RED phase, you must write a test that fails first before writing implementation code.\n\n` +
            `\`\`\`text\n${outputPreview}\n\`\`\``;
        }
      } else if (phaseBefore === "green") {
        if (raw.exitCode === 0) {
          // Success in GREEN phase!
          phaseAfter = "refactor";
          state.phase = "refactor";
          saveTDDState(ctx.cwd, state);
          updateTUI(ctx, state);

          message =
            `✅ **TDD GREEN Verified**: Test passed (Exit code: 0)!\n` +
            `🔵 **Phase Transition**: Advanced to **REFACTOR**.\n\n` +
            `**Next Step**: Clean up implementation, eliminate duplication, and verify again. Both test and source files are now editable.\n\n` +
            `\`\`\`text\n${outputPreview}\n\`\`\``;
        } else {
          // Still failing in GREEN phase
          message =
            `⚠️ **TDD GREEN Incomplete**: Test is still failing (Exit code: ${raw.exitCode}).\n` +
            `Keep refining the application code until the test passes.\n\n` +
            `\`\`\`text\n${outputPreview}\n\`\`\``;
        }
      } else if (phaseBefore === "refactor") {
        if (raw.exitCode === 0) {
          state.cyclesCompleted += 1;
          phaseAfter = "red";
          state.phase = "red";
          saveTDDState(ctx.cwd, state);
          updateTUI(ctx, state);

          message =
            `✅ **TDD REFACTOR Verified**: Tests remain clean and passing!\n` +
            `🎉 Completed TDD Cycle ${state.cyclesCompleted}.\n\n` +
            `🔴 **Phase Transition**: Reset to **RED** for the next feature slice or test case.\n` +
            `Run \`/tdd off\` if you are finished.`;
        } else {
          message =
            `⚠️ **TDD REFACTOR Regression**: Refactoring broke existing tests (Exit code: ${raw.exitCode}).\n` +
            `Revert or fix the regression.\n\n` +
            `\`\`\`text\n${outputPreview}\n\`\`\``;
        }
      }

      return {
        content: [{ type: "text", text: message }],
        details: {
          phaseBefore,
          phaseAfter,
          exitCode: raw.exitCode,
          command: cmd,
          cyclesCompleted: state.cyclesCompleted,
        },
      };
    },
  });

  // 3. Register Slash Command: /tdd
  pi.registerCommand("tdd", {
    description: "Manage Test-Driven Development mode: /tdd <test-command>, /tdd status, /tdd off",
    getArgumentCompletions: (prefix: string) => {
      const options = ["pnpm test", "npm test", "pnpm check", "status", "off"];
      const filtered = options.filter((o) => o.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((v) => ({ value: v, label: v })) : null;
    },
    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      const trimmed = rawArgs.trim();
      const state = loadTDDState(ctx.cwd);

      if (trimmed === "off" || trimmed === "exit") {
        state.phase = "idle";
        saveTDDState(ctx.cwd, state);
        updateTUI(ctx, state);
        ctx.ui.notify("TDD mode disabled. Returned to idle.", "info");
        return;
      }

      if (trimmed === "status" || (!trimmed && state.phase !== "idle")) {
        updateTUI(ctx, state);
        const info =
          `### 🧪 TDD State\n\n` +
          `• **Phase**: \`${state.phase.toUpperCase()}\`\n` +
          `• **Test Command**: \`${state.testCommand}\`\n` +
          `• **Target Test File**: \`${state.testFile ?? "None"}\`\n` +
          `• **Cycles Completed**: ${state.cyclesCompleted}\n\n` +
          `**Commands**: \`/tdd <test-command>\`, \`/tdd off\`, call \`verify_tdd_step\` to advance.`;

        if (pi.sendMessage) {
          pi.sendMessage({ customType: "tdd-status", content: info, display: true });
        } else {
          ctx.ui.notify(`TDD [${state.phase.toUpperCase()}]: ${state.testCommand}`, "info");
        }
        return;
      }

      const command = trimmed || "pnpm test";
      state.phase = "red";
      state.testCommand = command;
      saveTDDState(ctx.cwd, state);
      updateTUI(ctx, state);

      ctx.ui.notify(`🔴 TDD RED Mode enabled: ${command}`, "warning");

      const prompt =
        `### 🔴 TDD Mode Enabled: RED Phase (Write Failing Test)\n\n` +
        `**Test Command**: \`${command}\`\n` +
        `**Active Rule**: Writing application source code is LOCKED. Only test files (*.spec.*, *.test.*) can be written or edited.\n\n` +
        `**Workflow**:\n` +
        `1. Write or update a test file describing the desired behavior.\n` +
        `2. Call \`verify_tdd_step\` to confirm the test fails as expected.\n` +
        `3. Once verified, the harness will transition to GREEN and unlock source code editing.`;

      if (pi.sendMessage) {
        pi.sendMessage({ customType: "tdd-prompt", content: prompt, display: true });
      }
    },
  });
}
