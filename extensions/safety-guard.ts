/**
 * Safety Guard Pi Extension
 *
 * Proactive security and execution sentinel:
 * - Blocks write and edit calls to sensitive files (.env, .git/, credentials, SSH keys)
 * - Intercepts dangerous bash commands (rm -rf, git push --force, sudo, chmod 777)
 * - Prompts for user confirmation in interactive TUI mode or blocks safely in headless mode
 * - Provides /safety command to inspect status and protection rules
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Security Patterns & Protected Paths
// ---------------------------------------------------------------------------

const PROTECTED_FILE_PATTERNS = [
  /(^|\/)\.env(\..+)?$/i, // .env, .env.local, .env.production
  /(^|\/)\.git\//i, // .git internals
  /(^|\/)node_modules\//i, // node_modules
  /\.(pem|key|pfx|pkcs12)$/i, // Certificate private keys
  /(^|\/)id_(rsa|ed25519|dsa)(\.pub)?$/i, // SSH keys
  /(^|\/)\.ssh\//i, // ~/.ssh
  /(^|\/)\.aws\//i, // AWS credentials
];

const DANGEROUS_BASH_PATTERNS = [
  {
    pattern: /\brm\s+(-rf?|--recursive)\s+[/~]/i,
    desc: "Recursive deletion of root or home directory",
  },
  {
    pattern: /\brm\s+(-rf?|--recursive)\s+(\.|\.\.|\*)(\s|$)/i,
    desc: "Recursive deletion of current directory or wildcard",
  },
  { pattern: /\bgit\s+push\b.*(-f|--force)\b/i, desc: "Forced git push to remote repository" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, desc: "Hard git reset discarding uncommitted changes" },
  { pattern: /\bgit\s+clean\s+-fdx?\b/i, desc: "Forced deletion of untracked git files" },
  { pattern: /\bsudo\b/i, desc: "Superuser elevation command (sudo)" },
  { pattern: /\b(chmod|chown)\s+(-R\s+)?777\b/i, desc: "World-writable permission change (777)" },
  { pattern: /:\(\)\{\s*:\s*\|\s*:\s*&\s*\};\s*:/, desc: "Fork bomb attack pattern" },
  { pattern: /\bmkfs\b/i, desc: "Filesystem formatting command" },
  { pattern: /\bdd\s+if=.*of=\/dev\//i, desc: "Direct block device write" },
];

function isProtectedPath(filePath: string): boolean {
  return PROTECTED_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

function matchDangerousCommand(command: string): string | null {
  for (const { pattern, desc } of DANGEROUS_BASH_PATTERNS) {
    if (pattern.test(command)) {
      return desc;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Extension Factory
// ---------------------------------------------------------------------------

export default function safetyGuardExtension(pi: ExtensionAPI): void {
  let safetyEnabled = true;

  // 1. Intercept Tool Calls (write, edit, bash)
  pi.on("tool_call", async (event, ctx) => {
    if (!safetyEnabled) return undefined;

    // A. Protect Sensitive Files against Write / Edit
    if (event.toolName === "write" || event.toolName === "edit") {
      const input = event.input as Record<string, unknown> | undefined;
      const targetPath = (
        typeof input?.path === "string"
          ? input.path
          : typeof input?.file_path === "string"
            ? input.file_path
            : ""
      ) as string;

      if (isProtectedPath(targetPath)) {
        if (ctx.hasUI) {
          ctx.ui.notify(`🛡️ Safety Guard: Blocked write to protected file: ${targetPath}`, "error");
        }
        return {
          block: true,
          reason: `Security Guard: Modifications to sensitive path '${targetPath}' (.env, .git, or credentials) are forbidden.`,
        };
      }
    }

    // B. Guard Dangerous Bash Commands
    if (event.toolName === "bash") {
      const input = event.input as Record<string, unknown> | undefined;
      const command = (typeof input?.command === "string" ? input.command : "") as string;
      const dangerDesc = matchDangerousCommand(command);

      if (dangerDesc) {
        if (!ctx.hasUI) {
          return {
            block: true,
            reason: `Safety Guard: Dangerous command blocked in headless mode (${dangerDesc}): '${command}'`,
          };
        }

        // In interactive TUI mode, prompt the developer explicitly
        const confirmationPrompt = `⚠️ [SAFETY GUARD] Potentially Destructive Command Detected:\n\n  $ ${command}\n\nRisk: ${dangerDesc}\n\nDo you want to allow this command to run?`;

        const choice = await ctx.ui.select(confirmationPrompt, [
          "❌ Block Command (Recommended)",
          "⚠️ Allow Execution Once",
        ]);

        if (!choice || !choice.startsWith("⚠️ Allow")) {
          ctx.ui.notify("🛡️ Safety Guard: Command execution blocked.", "warning");
          return {
            block: true,
            reason: `Execution blocked by user via Safety Guard: ${dangerDesc}`,
          };
        }
      }
    }

    return undefined;
  });

  // 2. Register Slash Command /safety
  pi.registerCommand("safety", {
    description: "Inspect or toggle Safety Guard protection: /safety [status|on|off]",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const arg = args.trim().toLowerCase();

      if (arg === "on" || arg === "enable") {
        safetyEnabled = true;
        ctx.ui.notify(
          "🛡️ Safety Guard is ENABLED (Protected paths and dangerous commands guarded).",
          "info",
        );
      } else if (arg === "off" || arg === "disable") {
        safetyEnabled = false;
        ctx.ui.notify(
          "⚠️ Safety Guard is DISABLED. Warning: Destructive commands will run unprompted.",
          "warning",
        );
      } else {
        const statusText = safetyEnabled
          ? "🛡️ Status: ACTIVE\nProtected: .env*, .git/, node_modules/, *.pem, *.key, SSH credentials\nGuarded Commands: rm -rf, git push --force, git reset --hard, sudo, chmod 777"
          : "⚠️ Status: INACTIVE (Run '/safety on' to activate)";

        ctx.ui.notify(statusText, safetyEnabled ? "info" : "warning");
      }
    },
  });

  // 3. Session Start Notification
  pi.on("session_start", (_event, ctx) => {
    if (ctx.hasUI) {
      ctx.ui.setStatus("safety-guard", ctx.ui.theme.fg("success", "🛡️"));
    }
  });
}
