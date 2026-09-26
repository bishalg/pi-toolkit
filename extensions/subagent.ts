/**
 * Subagent Pi Extension
 *
 * Spawns isolated, headless sub-agent instances (`pi -p`) to handle
 * deep exploratory tasks, test runs, or code reviews in a clean context window,
 * returning only a distilled summary back to the parent session.
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import {
  MAX_TIMEOUT_SECONDS,
  handleOutputTruncation,
  resolveBinary,
  runSafeProcess,
} from "./shared/exec-safe.ts";

// ---------------------------------------------------------------------------
// Parameters & Types
// ---------------------------------------------------------------------------

export const SubagentParams = Type.Object({
  task: Type.String({
    description: "Detailed description of the task for the sub-agent to execute autonomously.",
  }),
  agent: Type.Optional(
    Type.String({
      description: "Optional agent profile/role name (e.g. 'code-review', 'test-runner', 'scout').",
    }),
  ),
  model: Type.Optional(
    Type.String({
      description: "Optional model override (e.g. 'gemini-3.8-flash-high', 'claude-sonnet-4-6').",
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for the subagent (defaults to current workspace).",
    }),
  ),
  timeout: Type.Optional(
    Type.Number({
      description: `Maximum execution timeout in seconds (default: 180s, max: ${MAX_TIMEOUT_SECONDS}s).`,
    }),
  ),
});

export type SubagentInput = Static<typeof SubagentParams>;

export interface SubagentDetails {
  task: string;
  agent?: string;
  model?: string;
  cwd: string;
  exitCode: number;
  durationMs: number;
  truncated: boolean;
  fullOutputPath?: string;
}

// ---------------------------------------------------------------------------
// Execution Handler
// ---------------------------------------------------------------------------

let cachedPiBinary: string | null = null;

function getPiBinary(): string {
  if (cachedPiBinary) {
    return cachedPiBinary;
  }
  try {
    const bin = resolveBinary("pi");
    cachedPiBinary = bin;
    return bin;
  } catch {
    return "pi";
  }
}

async function executeSubagent(
  params: SubagentInput,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<SubagentDetails> | undefined,
  ctx: ExtensionContext,
): Promise<AgentToolResult<SubagentDetails>> {
  const cwd = params.cwd || ctx.cwd;
  const timeoutSeconds = params.timeout ?? 180;
  const binaryPath = getPiBinary();

  const args: string[] = ["-p", "--mode", "json"];

  if (params.model) {
    args.push("--model", params.model);
  }

  // Pass prompt task as the final print argument
  args.push(params.task);

  let liveOutput = "";
  let lastUpdateAt = 0;

  const raw = await runSafeProcess({
    binaryPath,
    args,
    cwd,
    timeoutSeconds,
    signal,
    onData: (chunk) => {
      liveOutput += chunk;
      const now = Date.now();
      if (onUpdate && now - lastUpdateAt > 150) {
        lastUpdateAt = now;
        onUpdate({
          content: [{ type: "text", text: `[Subagent Working...] ${liveOutput.slice(-300)}` }],
          details: {
            task: params.task,
            agent: params.agent,
            model: params.model,
            cwd,
            exitCode: 0,
            durationMs: 0,
            truncated: false,
          },
        });
      }
    },
  });

  // Extract text or clean summary from output
  let resultSummary = raw.stdout.trim() || raw.stderr.trim();

  // If output contains JSON stream entries from pi -p, extract assistant messages
  if (resultSummary.includes('{"type":') || resultSummary.includes('"content":')) {
    const lines = resultSummary.split("\n");
    const extracted: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "message" && parsed.role === "assistant" && parsed.content) {
          extracted.push(
            typeof parsed.content === "string" ? parsed.content : JSON.stringify(parsed.content),
          );
        } else if (parsed.content && typeof parsed.content === "string") {
          extracted.push(parsed.content);
        }
      } catch {
        // Not a JSON line, keep plain text
        if (line.trim()) extracted.push(line);
      }
    }
    if (extracted.length > 0) {
      resultSummary = extracted.join("\n");
    }
  }

  const truncated = await handleOutputTruncation(resultSummary, "subagent");

  return {
    content: [{ type: "text", text: truncated.resultText }],
    details: {
      task: params.task,
      agent: params.agent,
      model: params.model,
      cwd,
      exitCode: raw.exitCode,
      durationMs: raw.durationMs,
      truncated: truncated.truncated,
      fullOutputPath: truncated.fullOutputPath,
    },
  };
}

// ---------------------------------------------------------------------------
// Extension Factory
// ---------------------------------------------------------------------------

export default function subagentExtension(pi: ExtensionAPI): void {
  // 1. Register Subagent Tool
  pi.registerTool({
    name: "subagent",
    label: "Subagent Task Runner",
    description:
      "Spawns an isolated background sub-agent process with its own context window to perform deep research, run verification suites, or audit code, returning a distilled summary.",
    promptSnippet:
      "Delegate isolated exploratory research, lint audits, or test runs to a subagent",
    promptGuidelines: [
      "Use 'subagent' when an exploratory or research task would otherwise pollute the primary context window with thousands of tokens.",
      "Provide a clear, specific, self-contained task prompt.",
    ],
    parameters: SubagentParams,
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      return executeSubagent(params, signal, onUpdate, ctx);
    },
  });

  // 2. Register Slash Command /subagent
  pi.registerCommand("subagent", {
    description: "Delegate a task to an isolated sub-agent: /subagent <task description>",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const task = args.trim();
      if (!task) {
        ctx.ui.notify("Usage: /subagent <task description>", "warning");
        return;
      }

      ctx.ui.notify("🚀 Launching subagent in isolated context...", "info");

      try {
        const result = await executeSubagent(
          { task },
          undefined,
          (update) => {
            const first = update.content[0];
            if (first && first.type === "text" && first.text && ctx.hasUI) {
              ctx.ui.setStatus("subagent", `Subagent: ${first.text.slice(-50)}`);
            }
          },
          ctx,
        );

        ctx.ui.setStatus("subagent", undefined);
        const firstResult = result.content[0];
        const text =
          (firstResult && firstResult.type === "text" ? firstResult.text : "") ||
          "Subagent finished with no output.";
        ctx.ui.notify("✔ Subagent completed successfully.", "info");
        if (pi.sendMessage) {
          pi.sendMessage({
            customType: "subagent-result",
            content: `### 🤖 Subagent Result\n**Task:** ${task}\n\n${text}`,
            display: true,
          });
        }
      } catch (err) {
        ctx.ui.setStatus("subagent", undefined);
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Subagent error: ${msg}`, "error");
      }
    },
  });
}
