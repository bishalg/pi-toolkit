/**
 * Disciplined Bug Diagnosis Pi Extension
 *
 * Upgrades Matt Pocock's diagnosing-bugs skill:
 * - Enforces the 6-step loop:
 *   1. Reproduce (minimal reproduction test/script)
 *   2. Minimize (reduce reproduction to essential variables)
 *   3. Hypothesize (formulate falsifiable hypothesis)
 *   4. Instrument (add targeted diagnostic logging/assertions, tracked in state)
 *   5. Fix (apply root-cause fix)
 *   6. Regression-Test (verify test passes AND strip all temporary instrumentation)
 * - Tracks instrumented files in .pi/diagnose-state.json
 * - Tool 'complete_diagnosis': Refuses to complete if lingering debug statements remain
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
import { resolveBinary, runSafeProcess, tokenizeArgs } from "./shared/exec-safe.ts";

// ---------------------------------------------------------------------------
// Types & State
// ---------------------------------------------------------------------------

export type DiagnosePhase =
  "idle" | "reproduce" | "minimize" | "hypothesize" | "instrument" | "fix" | "verify";

export interface HypothesisItem {
  id: string;
  text: string;
  status: "active" | "confirmed" | "refuted";
}

export interface DiagnoseState {
  activeBug?: string;
  phase: DiagnosePhase;
  hypotheses: HypothesisItem[];
  instrumentedFiles: string[];
  regressionCommand?: string;
  updatedAt: string;
}

function getStateFilePath(cwd: string): string {
  return path.join(cwd, ".pi", "diagnose-state.json");
}

function loadDiagnoseState(cwd: string): DiagnoseState {
  try {
    const file = getStateFilePath(cwd);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf8")) as DiagnoseState;
    }
  } catch {
    // Default
  }
  return {
    phase: "idle",
    hypotheses: [],
    instrumentedFiles: [],
    updatedAt: new Date().toISOString(),
  };
}

function saveDiagnoseState(cwd: string, state: DiagnoseState): void {
  try {
    const dir = path.join(cwd, ".pi");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(getStateFilePath(cwd), JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// Tool Schemas
// ---------------------------------------------------------------------------

export const TrackInstrumentationParams = Type.Object({
  file: Type.String({
    description:
      "Relative or absolute file path where temporary debug instrumentation was added or removed.",
  }),
  action: Type.Union([Type.Literal("add"), Type.Literal("remove")], {
    description: "'add' when adding temporary debug logs/assertions; 'remove' when cleaned up.",
  }),
  note: Type.Optional(
    Type.String({
      description: "Optional description of what was instrumented.",
    }),
  ),
});

export type TrackInstrumentationInput = Static<typeof TrackInstrumentationParams>;

export const CompleteDiagnosisParams = Type.Object({
  regressionCommand: Type.Optional(
    Type.String({
      description:
        "Test command to verify fix and ensure zero regressions (defaults to 'pnpm test').",
    }),
  ),
  rootCauseSummary: Type.String({
    description: "Clear explanation of the confirmed root cause and how it was resolved.",
  }),
});

export type CompleteDiagnosisInput = Static<typeof CompleteDiagnosisParams>;

// ---------------------------------------------------------------------------
// Extension Factory
// ---------------------------------------------------------------------------

export default function diagnoseExtension(pi: ExtensionAPI): void {
  function updateTUI(ctx: ExtensionContext, state: DiagnoseState): void {
    if (!ctx.hasUI) return;

    if (state.phase === "idle") {
      ctx.ui.setStatus("diagnose", undefined);
    } else {
      const count = state.instrumentedFiles.length;
      const instrumentLabel = count > 0 ? ` (${count} files instrumented)` : "";
      ctx.ui.setStatus(
        "diagnose",
        ctx.ui.theme.fg("warning", `🐞 DIAGNOSE: ${state.phase.toUpperCase()}${instrumentLabel}`),
      );
    }
  }

  // 0. Session Start: Restore TUI status
  pi.on("session_start", async (_event, ctx) => {
    const state = loadDiagnoseState(ctx.cwd);
    updateTUI(ctx, state);
  });

  // 1. Tool: track_diagnostic_instrumentation
  pi.registerTool({
    name: "track_diagnostic_instrumentation",
    label: "Track Debug Instrumentation",
    description:
      "Tracks files where temporary diagnostic logging, assertions, or probe code were inserted, ensuring they are removed before closing the bug.",
    promptSnippet: "Register or unregister temporary debug instrumentation in a file",
    promptGuidelines: [
      "Call 'track_diagnostic_instrumentation' whenever adding temporary debug logs or probes.",
      "Call with action: 'remove' after cleaning them up.",
    ],
    parameters: TrackInstrumentationParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const state = loadDiagnoseState(ctx.cwd);
      const rel = path.relative(ctx.cwd, path.resolve(ctx.cwd, params.file)).replace(/\\/g, "/");

      if (params.action === "add") {
        if (!state.instrumentedFiles.includes(rel)) {
          state.instrumentedFiles.push(rel);
        }
      } else {
        state.instrumentedFiles = state.instrumentedFiles.filter((f) => f !== rel);
      }

      saveDiagnoseState(ctx.cwd, state);
      updateTUI(ctx, state);

      return {
        content: [
          {
            type: "text",
            text: `Tracked instrumentation for \`${rel}\` (${params.action}). Total active instrumented files: ${state.instrumentedFiles.length}.`,
          },
        ],
        details: {
          file: rel,
          action: params.action,
          activeCount: state.instrumentedFiles.length,
        },
      };
    },
  });

  // 2. Tool: complete_diagnosis
  pi.registerTool({
    name: "complete_diagnosis",
    label: "Complete Bug Diagnosis",
    description:
      "Validates that all temporary instrumentation has been stripped and runs the regression test suite before concluding diagnosis.",
    promptSnippet: "Verify cleanup and test passing to conclude bug diagnosis",
    promptGuidelines: [
      "Call 'complete_diagnosis' only after the root cause is resolved and verified.",
      "All temporary debug statements must be removed before calling.",
    ],
    parameters: CompleteDiagnosisParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx): Promise<AgentToolResult<unknown>> {
      const state = loadDiagnoseState(ctx.cwd);

      // A. Check for lingering files marked as instrumented
      if (state.instrumentedFiles.length > 0) {
        // Inspect each file for temporary console.log or debug probes
        const lingering: string[] = [];
        for (const file of state.instrumentedFiles) {
          const abs = path.join(ctx.cwd, file);
          if (fs.existsSync(abs)) {
            const content = fs.readFileSync(abs, "utf8");
            if (
              content.includes("console.log(") ||
              content.includes("console.debug(") ||
              content.includes("// DEBUG_PROBE") ||
              content.includes("// TEMP_DEBUG")
            ) {
              lingering.push(file);
            }
          }
        }

        if (lingering.length > 0) {
          throw new Error(
            `❌ Cannot complete diagnosis: Lingering debug instrumentation detected in:\n` +
              lingering.map((f) => `  - ${f}`).join("\n") +
              `\n\nStrip all temporary console.log and probe code, then call complete_diagnosis again.`,
          );
        }
      }

      // B. Run regression test
      const testCmd = params.regressionCommand || state.regressionCommand || "pnpm test";
      if (onUpdate) {
        onUpdate({
          content: [{ type: "text", text: `Running regression verification: \`${testCmd}\`...` }],
          details: {
            resolved: false,
            testCommand: testCmd,
            exitCode: -1,
          },
        });
      }

      const parts = tokenizeArgs(testCmd);
      if (parts.length === 0) {
        throw new Error("Regression test command cannot be empty.");
      }
      const binary = parts[0];
      const args = parts.slice(1);

      let resolvedBinary: string;
      try {
        resolvedBinary = resolveBinary(binary);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        throw new Error(
          `❌ Test runner not found for '${testCmd}': ${errorMsg}. Please ensure it is installed and on your PATH.`,
          { cause: err },
        );
      }

      const raw = await runSafeProcess({
        binaryPath: resolvedBinary,
        args,
        cwd: ctx.cwd,
        timeoutSeconds: 120,
        signal,
      });

      if (raw.exitCode !== 0) {
        const preview = (raw.stdout + "\n" + raw.stderr).trim().slice(-1000);
        throw new Error(
          `❌ Regression test failed with exit code ${raw.exitCode}.\n\n\`\`\`text\n${preview}\n\`\`\``,
        );
      }

      // Cleanup state
      state.phase = "idle";
      state.instrumentedFiles = [];
      state.activeBug = undefined;
      saveDiagnoseState(ctx.cwd, state);
      updateTUI(ctx, state);

      const summary =
        `🎉 **Bug Diagnosis Complete & Verified**\n\n` +
        `• **Root Cause**: ${params.rootCauseSummary}\n` +
        `• **Regression Test**: \`${testCmd}\` passed with exit code 0.\n` +
        `• **Code Hygiene**: 0 lingering debug statements detected.\n` +
        `Diagnosis session concluded cleanly.`;

      return {
        content: [{ type: "text", text: summary }],
        details: {
          resolved: true,
          testCommand: testCmd,
          exitCode: 0,
          remainingInstrumented: state.instrumentedFiles.length,
        },
      };
    },
  });

  // 3. Command: /diagnose
  pi.registerCommand("diagnose", {
    description:
      "Disciplined bug diagnosis loop: /diagnose <bug-description>, /diagnose status, /diagnose off",
    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      const trimmed = rawArgs.trim();
      const state = loadDiagnoseState(ctx.cwd);

      if (trimmed === "off" || trimmed === "exit") {
        state.phase = "idle";
        state.instrumentedFiles = [];
        saveDiagnoseState(ctx.cwd, state);
        updateTUI(ctx, state);
        ctx.ui.notify("Diagnose mode disabled.", "info");
        return;
      }

      if (trimmed === "status") {
        updateTUI(ctx, state);
        const info =
          `### 🐞 Bug Diagnosis Status\n\n` +
          `• **Bug**: \`${state.activeBug ?? "None"}\`\n` +
          `• **Phase**: \`${state.phase.toUpperCase()}\`\n` +
          `• **Instrumented Files**: ${state.instrumentedFiles.length > 0 ? state.instrumentedFiles.join(", ") : "None"}\n` +
          `• **Hypotheses**: ${state.hypotheses.length}\n`;

        if (pi.sendMessage) {
          pi.sendMessage({ customType: "diagnose-status", content: info, display: true });
        } else {
          ctx.ui.notify(`Diagnose [${state.phase}]: ${state.activeBug ?? "None"}`, "info");
        }
        return;
      }

      let bugDesc = trimmed;
      if (!bugDesc && ctx.hasUI) {
        bugDesc = (await ctx.ui.input("Enter bug description or symptom to diagnose:")) || "";
      }

      if (!bugDesc) {
        ctx.ui.notify("Please specify a bug to diagnose: /diagnose <symptom>", "warning");
        return;
      }

      state.activeBug = bugDesc;
      state.phase = "reproduce";
      state.instrumentedFiles = [];
      saveDiagnoseState(ctx.cwd, state);
      updateTUI(ctx, state);

      const prompt =
        `### 🐞 Disciplined Bug Diagnosis: ${bugDesc}\n\n` +
        `Enforce the 6-step diagnosis discipline:\n` +
        `1. **Reproduce**: Create or identify a minimal test case or command that reliably triggers the failure.\n` +
        `2. **Minimize**: Strip unnecessary variables, configs, and lines until the smallest failing repro remains.\n` +
        `3. **Hypothesize**: State an explicit, falsifiable hypothesis for why this failure occurs.\n` +
        `4. **Instrument**: Add targeted probes/assertions. (Call \`track_diagnostic_instrumentation\` for every file modified).\n` +
        `5. **Fix**: Apply the minimal root-cause solution.\n` +
        `6. **Regression-Test & Clean**: Strip all temporary probes and call \`complete_diagnosis\` with the test command.`;

      if (pi.sendMessage) {
        pi.sendMessage({ customType: "diagnose-prompt", content: prompt, display: true });
      }
    },
  });
}
