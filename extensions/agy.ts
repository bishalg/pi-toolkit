/**
 * AgY (Antigravity CLI) Pi Extension
 *
 * Provides safe direct execution of the 'agy' CLI from within Pi:
 * - Registers LLM tool 'agy' for agent-driven commands, models inspection, and prompt delegation.
 * - Registers '/agy' slash command for direct interactive and CLI command execution.
 * - Safe process execution with shell: false (no shell injection vulnerabilities).
 * - Automatic binary resolution across PATH and standard install directories (~/.local/bin, /usr/local/bin, /opt/homebrew/bin).
 * - Argument tokenizer supporting quotes and escaping without an intermediate shell.
 * - Output truncation protection (50KB / 2000 lines limit) with temporary file dumping for large outputs.
 * - Comprehensive error handling for missing binary, non-zero exits, timeouts, and cancellations.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
  Theme,
  ToolRenderResultOptions,
} from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_SECONDS = 60;
const MAX_TIMEOUT_SECONDS = 600;
const UPDATE_THROTTLE_MS = 100;

const AgyToolParams = Type.Object({
  args: Type.Array(Type.String(), {
    description:
      "Raw CLI arguments array to pass directly to agy (e.g. ['plugin', 'list'], ['models'], ['changelog'], ['mcp', 'list'], ['-p', 'Review this bug']).",
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

export interface AgyExecutionOptions {
  args: string[];
  cwd: string;
  timeoutSeconds?: number;
  signal?: AbortSignal;
  onData?: (chunk: string) => void;
}

export interface RawExecutionResult {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
  resolvedBinary: string;
}

// ---------------------------------------------------------------------------
// Binary Resolution
// ---------------------------------------------------------------------------

let cachedAgyBinary: string | null = null;

/**
 * Safely resolves the absolute path to the 'agy' binary.
 * Probes PATH and standard system/user directories without invoking a subshell.
 */
export function resolveAgyBinary(): string {
  if (cachedAgyBinary) {
    try {
      accessSync(cachedAgyBinary, fsConstants.X_OK);
      return cachedAgyBinary;
    } catch {
      cachedAgyBinary = null;
    }
  }

  const isWin = process.platform === "win32";
  const binaryName = isWin ? "agy.exe" : "agy";
  const pathDirs = (process.env.PATH || "").split(delimiter);

  const candidateDirs = [
    ...pathDirs,
    join(homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    join(homedir(), ".bin"),
  ];

  const seen = new Set<string>();
  for (const dir of candidateDirs) {
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    const fullPath = join(dir, binaryName);
    try {
      accessSync(fullPath, fsConstants.X_OK);
      cachedAgyBinary = fullPath;
      return fullPath;
    } catch {
      // Continue probing candidate paths
    }
  }

  throw new Error(
    "The 'agy' CLI binary could not be found in PATH or standard installation locations " +
      "(~/.local/bin, /usr/local/bin, /opt/homebrew/bin). " +
      "Please ensure Antigravity CLI is installed and accessible.",
  );
}

// ---------------------------------------------------------------------------
// Argument Parsing & Sanitization
// ---------------------------------------------------------------------------

/**
 * Tokenizes a shell-like command string into an arguments array safely.
 * Preserves double-quoted and single-quoted strings, handles backslash escapes,
 * and eliminates arbitrary shell evaluation.
 */
export function tokenizeArgs(commandStr: string): string[] {
  const args: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < commandStr.length; i++) {
    const char = commandStr[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      if (inSingle) {
        current += char;
      } else {
        escaped = true;
      }
      continue;
    }

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }

    if (/\s/.test(char) && !inSingle && !inDouble) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

/**
 * Normalizes raw CLI arguments for agy execution.
 * Only strips a redundant leading 'agy' binary token if present.
 */
export function sanitizeAgyArgs(rawArgs: string[]): string[] {
  const args = [...rawArgs];

  // Strip leading 'agy' or path/to/agy if caller included it
  if (args.length > 0) {
    const first = args[0];
    if (first === "agy" || first.endsWith("/agy") || first.endsWith("\\agy")) {
      args.shift();
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Safe Process Execution
// ---------------------------------------------------------------------------

/**
 * Directly executes the resolved agy binary with stdio pipes and process lifecycle guards.
 */
export async function runAgyProcess(options: AgyExecutionOptions): Promise<RawExecutionResult> {
  const binaryPath = resolveAgyBinary();
  const startTime = Date.now();
  const timeoutSecs = Math.min(
    Math.max(1, options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS),
    MAX_TIMEOUT_SECONDS,
  );
  const timeoutMs = timeoutSecs * 1000;

  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(binaryPath, options.args, {
        cwd: options.cwd,
        shell: false, // Invariant: direct execution prevents shell injection
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          LANG: process.env.LANG || "en_US.UTF-8",
        },
      });
    } catch (spawnError) {
      return reject(spawnError);
    }

    let stdout = "";
    let stderr = "";
    let combined = "";
    let timedOut = false;
    let aborted = false;

    const killProcess = (signalName: NodeJS.Signals = "SIGTERM") => {
      if (child && !child.killed) {
        try {
          child.kill(signalName);
        } catch {
          // Process may already be dead
        }
        // Force kill after 2 seconds if still running
        setTimeout(() => {
          if (child && !child.killed) {
            try {
              child.kill("SIGKILL");
            } catch {
              // Ignored
            }
          }
        }, 2000);
      }
    };

    if (options.signal) {
      if (options.signal.aborted) {
        aborted = true;
        killProcess("SIGKILL");
      } else {
        options.signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            killProcess("SIGTERM");
          },
          { once: true },
        );
      }
    }

    const timeoutId = setTimeout(() => {
      timedOut = true;
      killProcess("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      stdout += text;
      combined += text;
      options.onData?.(text);
    });

    child.stderr?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      stderr += text;
      combined += text;
      options.onData?.(text);
    });

    child.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    });

    child.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      resolve({
        stdout,
        stderr,
        combined,
        exitCode: code ?? (timedOut || aborted ? 1 : 0),
        durationMs,
        timedOut,
        aborted,
        resolvedBinary: binaryPath,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Tool Execution & Truncation Orchestration
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

  let raw: RawExecutionResult;
  try {
    raw = await runAgyProcess({
      args,
      cwd,
      timeoutSeconds: params.timeout,
      signal,
      onData: (chunk) => {
        liveOutput += chunk;
        scheduleUpdate();
      },
    });
  } catch (err: any) {
    if (updateTimer) clearTimeout(updateTimer);
    throw new Error(`Failed to execute agy: ${err.message || String(err)}`, { cause: err });
  } finally {
    if (updateTimer) clearTimeout(updateTimer);
  }

  const cmdStr = `agy ${args.join(" ")}`;

  // Handle timeout & abort scenarios explicitly
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

  // Prepare primary output text
  let outputText = "";
  if (raw.stdout.trim().length > 0) {
    outputText = raw.stdout;
    // If there is also stderr content (non-fatal warning or notice), append it cleanly
    if (raw.stderr.trim().length > 0 && raw.exitCode === 0) {
      outputText += `\n\n[agy stderr]:\n${raw.stderr}`;
    }
  } else if (raw.stderr.trim().length > 0) {
    // Some commands like `agy --help` write to stderr with exit code 0
    outputText = raw.stderr;
  } else {
    outputText = "(no output)";
  }

  // Check truncation thresholds
  const truncation = truncateTail(outputText, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  let fullOutputPath: string | undefined;
  let resultText = truncation.content;

  if (truncation.truncated) {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-agy-"));
    const logFilePath = join(tempDir, "output.log");
    fullOutputPath = logFilePath;
    await withFileMutationQueue(logFilePath, async () => {
      await writeFile(logFilePath, outputText, "utf-8");
    });

    const omittedLines = truncation.totalLines - truncation.outputLines;
    const omittedBytes = truncation.totalBytes - truncation.outputBytes;
    resultText += `\n\n[Output truncated: showing last ${truncation.outputLines} of ${truncation.totalLines} lines`;
    resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
    resultText += ` ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.`;
    resultText += ` Full output saved to: ${fullOutputPath}]`;
  }

  const details: AgyToolDetails = {
    command: cmdStr,
    args,
    cwd,
    exitCode: raw.exitCode,
    durationMs: raw.durationMs,
    stdoutBytes: Buffer.byteLength(raw.stdout, "utf-8"),
    stderrBytes: Buffer.byteLength(raw.stderr, "utf-8"),
    truncated: truncation.truncated,
    fullOutputPath,
    resolvedBinary: raw.resolvedBinary,
  };

  // Throw on non-zero exit code so agent runtime marks failure while receiving full diagnostics
  if (raw.exitCode !== 0) {
    const errorHeader = `agy command failed with exit code ${raw.exitCode}\nCommand: ${cmdStr}\n`;
    const errorDetails = resultText !== "(no output)" ? `\nOutput:\n${resultText}` : "";
    throw new Error(`${errorHeader}${errorDetails}`);
  }

  return {
    content: [{ type: "text", text: resultText }],
    details,
  };
}

// ---------------------------------------------------------------------------
// Extension Entry Point
// ---------------------------------------------------------------------------

export default function agyExtension(pi: ExtensionAPI) {
  // Register the model-callable tool
  pi.registerTool({
    name: "agy",
    label: "agy",
    description:
      `Safely execute 'agy' (Antigravity CLI) commands directly using raw CLI argument arrays. ` +
      `Takes raw CLI args (e.g. ['plugin', 'list'], ['models'], ['changelog'], ['mcp', 'list'], ['-p', 'prompt']). ` +
      `Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}. ` +
      `If truncated, full output is saved to a temporary log file.`,
    promptSnippet:
      "Execute 'agy' (Antigravity CLI) commands using raw CLI argument arrays (e.g. ['plugin', 'list'])",
    promptGuidelines: [
      "The 'agy' tool only accepts raw CLI argument arrays in the 'args' parameter (e.g. ['plugin', 'list'], ['models'], ['changelog']).",
      "Specify each CLI flag and argument as a separate element in 'args' (e.g. ['-p', 'Explain this file', '--model', 'gemini-3.8-flash-high']).",
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

  // Register the user-callable slash command
  pi.registerCommand("agy", {
    description:
      "Execute 'agy' CLI commands directly (e.g. /agy models, /agy changelog, /agy -p 'prompt')",
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
        "-p",
        "--print",
        "--model",
        "--effort",
        "--output-format",
        "--dangerously-skip-permissions",
      ];
      const filtered = subcommands.filter((cmd) => cmd.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((c) => ({ value: c, label: c })) : null;
    },

    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      let parsedArgs: string[] = tokenizeArgs(rawArgs.trim());

      // If invoked without arguments in interactive mode, offer a command picker
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
        const raw = await runAgyProcess({
          args,
          cwd: ctx.cwd,
          timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
        });

        const output = raw.stdout.trim() || raw.stderr.trim() || "(no output)";

        if (raw.exitCode === 0) {
          const lineCount = output.split("\n").length;
          // If output is substantial and in TUI mode, open in multi-line editor viewer
          if (lineCount > 5 && ctx.mode === "tui" && ctx.hasUI) {
            await ctx.ui.editor(cmdDisplay, output);
          } else {
            ctx.ui.notify(output, "info");
          }
        } else {
          const errorMsg = `Command failed with code ${raw.exitCode}:\n${output}`;
          ctx.ui.notify(errorMsg, "error");
        }
      } catch (err: any) {
        ctx.ui.notify(`Execution error: ${err.message || String(err)}`, "error");
      }
    },
  });
}
