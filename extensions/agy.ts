/**
 * AgY (Antigravity CLI) Pi Extension
 *
 * Provides safe direct execution of the 'agy' CLI from within Pi:
 * - Registers LLM tool 'agy' for agent-driven inspection, models, plugins, and MCP commands.
 * - Registers '/agy' slash command for direct interactive and CLI command execution.
 * - Uses shared exec-safe process runner (shell: false, signal cleanup, truncation guards).
 */

import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import {
  DEFAULT_TIMEOUT_SECONDS,
  MAX_TIMEOUT_SECONDS,
  handleOutputTruncation,
  resolveBinary,
  runSafeProcess,
  tokenizeArgs,
} from "./shared/exec-safe.ts";

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

const UPDATE_THROTTLE_MS = 100;

const AgyToolParams = Type.Object({
  args: Type.Array(Type.String(), {
    description:
      "Raw CLI arguments array to pass directly to agy (e.g. ['plugin', 'list'], ['models'], ['changelog'], ['mcp', 'list']).",
  }),
  timeout: Type.Optional(
    Type.Number({
      description: `Timeout in seconds (default: ${DEFAULT_TIMEOUT_SECONDS}s, max: ${MAX_TIMEOUT_SECONDS}s).`,
    }),
  ),
  cwd: Type.Optional(
    Type.String({
      description: "Working directory for execution (defaults to session cwd).",
    }),
  ),
});

type AgyToolInput = Static<typeof AgyToolParams>;

export interface AgyToolDetails {
  command: string;
  args: string[];
  cwd: string;
  exitCode: number;
  durationMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  truncated: boolean;
  fullOutputPath?: string;
  resolvedBinary: string;
}

// ---------------------------------------------------------------------------
// Binary Resolution & Normalization
// ---------------------------------------------------------------------------

let cachedAgyBinary: string | null = null;

export function resolveAgyBinary(): string {
  if (cachedAgyBinary) {
    return cachedAgyBinary;
  }
  const binary = resolveBinary("agy");
  cachedAgyBinary = binary;
  return binary;
}

export function sanitizeAgyArgs(rawArgs: string[]): string[] {
  const args = [...rawArgs];
  if (args.length > 0) {
    const first = args[0];
    if (first === "agy" || first.endsWith("/agy") || first.endsWith("\\agy")) {
      args.shift();
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// Execution Handler
// ---------------------------------------------------------------------------

async function handleAgyExecution(
  params: AgyToolInput,
  signal: AbortSignal | undefined,
  onUpdate: AgentToolUpdateCallback<AgyToolDetails> | undefined,
  ctx: ExtensionContext,
): Promise<AgentToolResult<AgyToolDetails>> {
  if (!params.args || !Array.isArray(params.args) || params.args.length === 0) {
    throw new Error(
      "The 'agy' tool requires a non-empty 'args' array (e.g. ['plugin', 'list'], ['models'], ['changelog']).",
    );
  }

  const cwd = params.cwd || ctx.cwd;
  const args = sanitizeAgyArgs(params.args);

  if (args.length === 0) {
    throw new Error(
      "The 'args' array contains no executable arguments after removing leading binary name.",
    );
  }

  let liveOutput = "";
  let updateTimer: NodeJS.Timeout | undefined;
  let lastUpdateAt = 0;

  const flushUpdate = () => {
    if (!onUpdate) return;
    lastUpdateAt = Date.now();
    onUpdate({
      content: [{ type: "text", text: liveOutput }],
      details: {
        command: `agy ${args.join(" ")}`,
        args,
        cwd,
        exitCode: 0,
        durationMs: 0,
        stdoutBytes: liveOutput.length,
        stderrBytes: 0,
        truncated: false,
        resolvedBinary: cachedAgyBinary || "agy",
      },
    });
  };

  const scheduleUpdate = () => {
    if (!onUpdate) return;
    const delay = UPDATE_THROTTLE_MS - (Date.now() - lastUpdateAt);
    if (delay <= 0) {
      if (updateTimer) {
        clearTimeout(updateTimer);
        updateTimer = undefined;
      }
      flushUpdate();
    } else if (!updateTimer) {
      updateTimer = setTimeout(() => {
        updateTimer = undefined;
        flushUpdate();
      }, delay);
    }
  };

  const binaryPath = resolveAgyBinary();
  let raw;
  try {
    raw = await runSafeProcess({
      binaryPath,
      args,
      cwd,
      timeoutSeconds: params.timeout,
      signal,
      onData: (chunk) => {
        liveOutput += chunk;
        scheduleUpdate();
      },
    });
  } catch (err: unknown) {
    if (updateTimer) clearTimeout(updateTimer);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to execute agy: ${msg}`, { cause: err });
  } finally {
    if (updateTimer) clearTimeout(updateTimer);
  }

  const cmdStr = `agy ${args.join(" ")}`;

  if (raw.timedOut) {
    const timeoutSecs = params.timeout ?? DEFAULT_TIMEOUT_SECONDS;
    const partialNotice = raw.combined.trim()
      ? `\n\n[Partial Output Before Timeout]:\n${raw.combined}`
      : "";
    throw new Error(
      `agy command timed out after ${timeoutSecs} seconds: ${cmdStr}${partialNotice}`,
    );
  }

  if (raw.aborted) {
    const partialNotice = raw.combined.trim()
      ? `\n\n[Partial Output Before Abort]:\n${raw.combined}`
      : "";
    throw new Error(`agy command was aborted: ${cmdStr}${partialNotice}`);
  }

  let outputText: string;
  if (raw.stdout.trim().length > 0) {
    outputText =
      raw.stderr.trim().length > 0 && raw.exitCode === 0
        ? `${raw.stdout}\n\n[agy stderr]:\n${raw.stderr}`
        : raw.stdout;
  } else if (raw.stderr.trim().length > 0) {
    outputText = raw.stderr;
  } else {
    outputText = "(no output)";
  }

  const truncation = await handleOutputTruncation(outputText, "pi-agy-");

  const details: AgyToolDetails = {
    command: cmdStr,
    args,
    cwd,
    exitCode: raw.exitCode,
    durationMs: raw.durationMs,
    stdoutBytes: Buffer.byteLength(raw.stdout, "utf-8"),
    stderrBytes: Buffer.byteLength(raw.stderr, "utf-8"),
    truncated: truncation.truncated,
    fullOutputPath: truncation.fullOutputPath,
    resolvedBinary: raw.resolvedBinary,
  };

  if (raw.exitCode !== 0) {
    const errorHeader = `agy command failed with exit code ${raw.exitCode}\nCommand: ${cmdStr}\n`;
    const errorDetails =
      truncation.resultText !== "(no output)" ? `\nOutput:\n${truncation.resultText}` : "";
    throw new Error(`${errorHeader}${errorDetails}`);
  }

  return {
    content: [{ type: "text", text: truncation.resultText }],
    details,
  };
}

// ---------------------------------------------------------------------------
// Extension Entry Point
// ---------------------------------------------------------------------------

export default function agyExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "agy",
    label: "agy",
    description:
      "Safely execute 'agy' (Antigravity CLI) commands directly using raw CLI argument arrays (e.g. ['plugin', 'list'], ['models'], ['changelog'], ['mcp', 'list']).",
    promptSnippet: "Execute 'agy' commands using raw CLI argument arrays (e.g. ['plugin', 'list'])",
    promptGuidelines: [
      "The 'agy' tool only accepts raw CLI argument arrays in the 'args' parameter (e.g. ['plugin', 'list'], ['models'], ['changelog']).",
      "Specify each CLI flag and argument as a separate element in 'args' (e.g. ['models'], ['mcp', 'list']).",
      "Never attempt interactive terminal input; all operations run non-interactively.",
    ],
    parameters: AgyToolParams,

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return handleAgyExecution(params, signal, onUpdate, ctx);
    },

    renderCall(args: AgyToolInput, theme: Theme) {
      let text = theme.fg("toolTitle", theme.bold("agy "));
      const summary = args.args && args.args.length > 0 ? args.args.join(" ") : "(no args)";
      text += theme.fg("accent", summary);
      if (args.timeout) {
        text += theme.fg("muted", ` (${args.timeout}s timeout)`);
      }
      return new Text(text, 0, 0);
    },

    renderResult(
      result: AgentToolResult<AgyToolDetails>,
      options: ToolRenderResultOptions,
      theme: Theme,
    ) {
      const details = result.details as AgyToolDetails | undefined;

      if (!details) {
        const content = result.content[0];
        const errorMsg =
          content?.type === "text" ? content.text.split("\n")[0] : "Execution failed";
        return new Text(theme.fg("error", `✗ ${errorMsg}`), 0, 0);
      }

      let statusText =
        details.exitCode === 0
          ? theme.fg("success", `✓ agy completed (${details.durationMs}ms)`)
          : theme.fg(
              "error",
              `✗ agy exited with code ${details.exitCode} (${details.durationMs}ms)`,
            );

      if (details.truncated) {
        statusText += theme.fg("warning", " [truncated]");
      }

      if (options.expanded) {
        const content = result.content[0];
        if (content?.type === "text") {
          const lines = content.text.split("\n");
          const preview = lines
            .slice(0, 20)
            .map((l) => theme.fg("dim", l))
            .join("\n");
          statusText += `\n${preview}`;
          if (lines.length > 20) {
            statusText += `\n${theme.fg("muted", `... (${lines.length - 20} more lines)`)}`;
          }
        }
        if (details.fullOutputPath) {
          statusText += `\n${theme.fg("dim", `Full log: ${details.fullOutputPath}`)}`;
        }
      }

      return new Text(statusText, 0, 0);
    },
  });

  pi.registerCommand("agy", {
    description:
      "Execute 'agy' CLI commands directly (e.g. /agy models, /agy changelog, /agy plugin list)",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = [
        "models",
        "agents",
        "changelog",
        "help",
        "mcp list",
        "plugins list",
        "update",
        "--help",
      ];
      const filtered = subcommands.filter((cmd) => cmd.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((c) => ({ value: c, label: c })) : null;
    },

    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      let parsedArgs: string[] = tokenizeArgs(rawArgs.trim());

      if (parsedArgs.length === 0 && ctx.mode === "tui" && ctx.hasUI) {
        const choice = await ctx.ui.select("Select agy operation", [
          "plugin list - List installed plugins",
          "models - List available models",
          "agents - List available agents",
          "changelog - View recent changelog",
          "help - Show agy CLI help",
          "mcp list - List configured MCP servers",
          "Custom - Enter custom arguments",
        ]);

        if (!choice) return;

        if (choice.startsWith("plugin list")) parsedArgs = ["plugin", "list"];
        else if (choice.startsWith("models")) parsedArgs = ["models"];
        else if (choice.startsWith("agents")) parsedArgs = ["agents"];
        else if (choice.startsWith("changelog")) parsedArgs = ["changelog"];
        else if (choice.startsWith("help")) parsedArgs = ["help"];
        else if (choice.startsWith("mcp")) parsedArgs = ["mcp", "list"];
        else if (choice.startsWith("Custom")) {
          const custom = await ctx.ui.input(
            "Enter agy arguments (e.g. plugin list):",
            "plugin list",
          );
          if (!custom) return;
          parsedArgs = tokenizeArgs(custom);
        }
      }

      if (parsedArgs.length === 0) {
        ctx.ui.notify(
          "Usage: /agy <args> (e.g. /agy plugin list, /agy models, /agy changelog)",
          "info",
        );
        return;
      }

      const args = sanitizeAgyArgs(parsedArgs);
      const cmdDisplay = `agy ${args.join(" ")}`;
      ctx.ui.notify(`Running: ${cmdDisplay}...`, "info");

      try {
        const binaryPath = resolveAgyBinary();
        const raw = await runSafeProcess({
          binaryPath,
          args,
          cwd: ctx.cwd,
          timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
        });

        const output = raw.stdout.trim() || raw.stderr.trim() || "(no output)";

        if (raw.exitCode === 0) {
          const lineCount = output.split("\n").length;
          if (lineCount > 5 && ctx.mode === "tui" && ctx.hasUI) {
            await ctx.ui.editor(cmdDisplay, output);
          } else {
            ctx.ui.notify(output, "info");
          }
        } else {
          const errorMsg = `Command failed with code ${raw.exitCode}:\n${output}`;
          ctx.ui.notify(errorMsg, "error");
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Execution error: ${msg}`, "error");
      }
    },
  });
}
