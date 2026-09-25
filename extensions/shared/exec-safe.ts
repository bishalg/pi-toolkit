/**
 * Shared Safe Process Execution Utility for Pi Extensions
 *
 * Provides:
 * - Direct spawn execution without intermediate shell (shell: false)
 * - POSIX-compliant argument tokenization (preserving quotes and escapes)
 * - Robust binary resolution across PATH and system directories
 * - Process lifecycle management (timeout, AbortSignal, SIGTERM -> SIGKILL)
 * - Safe output truncation (>50KB / 2000 lines) with temp file logging
 */

import { spawn, type ChildProcess } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateTail,
  withFileMutationQueue,
} from "@earendil-works/pi-coding-agent";

export const DEFAULT_TIMEOUT_SECONDS = 60;
export const MAX_TIMEOUT_SECONDS = 600;

export interface ExecSafeOptions {
  binaryPath: string;
  args: string[];
  cwd: string;
  timeoutSeconds?: number;
  signal?: AbortSignal;
  onData?: (chunk: string) => void;
  env?: NodeJS.ProcessEnv;
}

export interface RawProcessResult {
  stdout: string;
  stderr: string;
  combined: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
  resolvedBinary: string;
}

export interface TruncatedOutputResult {
  resultText: string;
  truncated: boolean;
  fullOutputPath?: string;
}

/**
 * Safely resolves an executable binary by scanning PATH and common install locations.
 */
export function resolveBinary(binaryName: string, extraDirs: string[] = []): string {
  const isWin = process.platform === "win32";
  const targetName = isWin && !binaryName.endsWith(".exe") ? `${binaryName}.exe` : binaryName;
  const pathDirs = (process.env.PATH || "").split(delimiter);

  const candidateDirs = [
    ...extraDirs,
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
    const fullPath = join(dir, targetName);
    try {
      accessSync(fullPath, fsConstants.X_OK);
      return fullPath;
    } catch {
      // Continue searching candidate paths
    }
  }

  throw new Error(
    `Binary '${binaryName}' was not found in PATH or standard locations (~/.local/bin, /usr/local/bin, /opt/homebrew/bin). Please ensure it is installed and on your PATH.`,
  );
}

/**
 * Tokenizes a shell-like command string into a discrete arguments array safely.
 * Preserves double-quoted and single-quoted tokens, escapes, and eliminates shell evaluation.
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
 * Directly executes a binary with process lifecycle guards (signal, timeout, cleanup).
 */
export async function runSafeProcess(options: ExecSafeOptions): Promise<RawProcessResult> {
  const startTime = Date.now();
  const timeoutSecs = Math.min(
    Math.max(1, options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS),
    MAX_TIMEOUT_SECONDS,
  );
  const timeoutMs = timeoutSecs * 1000;

  return new Promise((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawn(options.binaryPath, options.args, {
        cwd: options.cwd,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...(options.env || {}),
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
          // Process might already be dead
        }
        setTimeout(() => {
          if (child && !child.killed) {
            try {
              child.kill("SIGKILL");
            } catch {
              // Ignore cleanup error
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
      clearTimeout(timeoutId);
      reject(err);
    });

    child.on("close", (code) => {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      resolve({
        stdout,
        stderr,
        combined,
        exitCode: code ?? (timedOut || aborted ? 1 : 0),
        durationMs,
        timedOut,
        aborted,
        resolvedBinary: options.binaryPath,
      });
    });
  });
}

/**
 * Handles output truncation against max bytes and max lines, persisting full output to a temp file.
 */
export async function handleOutputTruncation(
  outputText: string,
  prefix = "pi-exec-",
): Promise<TruncatedOutputResult> {
  const truncation = truncateTail(outputText, {
    maxLines: DEFAULT_MAX_LINES,
    maxBytes: DEFAULT_MAX_BYTES,
  });

  if (!truncation.truncated) {
    return {
      resultText: truncation.content,
      truncated: false,
    };
  }

  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  const logFilePath = join(tempDir, "output.log");

  await withFileMutationQueue(logFilePath, async () => {
    await writeFile(logFilePath, outputText, "utf-8");
  });

  const omittedLines = truncation.totalLines - truncation.outputLines;
  const omittedBytes = truncation.totalBytes - truncation.outputBytes;
  let resultText = truncation.content;
  resultText += `\n\n[Output truncated: showing last ${truncation.outputLines} of ${truncation.totalLines} lines`;
  resultText += ` (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)}).`;
  resultText += ` ${omittedLines} lines (${formatSize(omittedBytes)}) omitted.`;
  resultText += ` Full output saved to: ${logFilePath}]`;

  return {
    resultText,
    truncated: true,
    fullOutputPath: logFilePath,
  };
}
