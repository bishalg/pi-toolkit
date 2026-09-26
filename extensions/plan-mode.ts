/**
 * Plan Mode Pi Extension
 *
 * Provides a read-only exploration and architecture mode:
 * - /plan command toggles safe exploration mode on/off
 * - Temporarily disables write and edit tools via pi.setActiveTools()
 * - Restricts terminal bash commands to a read-only allowlist
 * - Displays a persistent '⏸ plan' status indicator in the TUI footer
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

// ---------------------------------------------------------------------------
// Constants & Tool Sets
// ---------------------------------------------------------------------------

const _PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "agy", "subagent"];
const WRITE_TOOLS = new Set<string>(["write", "edit"]);

// Safe read-only inspection command prefixes
const READ_ONLY_COMMANDS = [
  "git status",
  "git diff",
  "git log",
  "git show",
  "git branch",
  "ls",
  "dir",
  "cat",
  "head",
  "tail",
  "grep",
  "rg",
  "find",
  "pwd",
  "which",
  "echo",
  "stat",
  "file",
  "wc",
  "node -v",
  "npm -v",
  "pnpm -v",
  "npm test",
  "pnpm test",
  "pnpm check",
  "npm run check",
  "tsc --noEmit",
  "pnpm model",
  "pnpm model status",
  "pnpm model scan",
];

function isSafeBashCommand(command: string): boolean {
  const trimmed = command.trim();
  // Check if command starts with any known read-only command prefix
  return READ_ONLY_COMMANDS.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(`${prefix} `),
  );
}

// ---------------------------------------------------------------------------
// Extension Factory
// ---------------------------------------------------------------------------

export default function planModeExtension(pi: ExtensionAPI): void {
  let isPlanMode = false;
  let toolsBeforePlanMode: string[] | undefined;

  function updatePlanUI(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    if (isPlanMode) {
      ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ PLAN MODE (Read-Only)"));
    } else {
      ctx.ui.setStatus("plan-mode", undefined);
    }
  }

  function enablePlanMode(ctx: ExtensionContext): void {
    if (isPlanMode) return;
    isPlanMode = true;
    toolsBeforePlanMode = pi.getActiveTools ? pi.getActiveTools() : undefined;

    // Filter out write tools from currently active tools
    if (pi.setActiveTools && toolsBeforePlanMode) {
      const filtered = toolsBeforePlanMode.filter((name) => !WRITE_TOOLS.has(name));
      pi.setActiveTools(filtered);
    }

    updatePlanUI(ctx);
    if (ctx.hasUI) {
      ctx.ui.notify(
        "⏸ Plan Mode ENABLED: Write & edit tools disabled. Exploration is strictly read-only.",
        "warning",
      );
    }
  }

  function disablePlanMode(ctx: ExtensionContext): void {
    if (!isPlanMode) return;
    isPlanMode = false;

    // Restore previously active tools
    if (pi.setActiveTools && toolsBeforePlanMode) {
      pi.setActiveTools(toolsBeforePlanMode);
    }

    updatePlanUI(ctx);
    if (ctx.hasUI) {
      ctx.ui.notify("▶ Plan Mode DISABLED: Full write and edit tools restored.", "info");
    }
  }

  // 1. Tool Call Interceptor to block write/edit and mutative bash during plan mode
  pi.on("tool_call", async (event, ctx) => {
    if (!isPlanMode) return undefined;

    if (WRITE_TOOLS.has(event.toolName)) {
      if (ctx.hasUI) {
        ctx.ui.notify(`Blocked ${event.toolName} operation: Plan Mode is active.`, "warning");
      }
      return {
        block: true,
        reason:
          "Plan Mode is active. All file modifications are disabled until the user exits plan mode via /plan.",
      };
    }

    if (event.toolName === "bash") {
      const command = (event.input?.command as string) || "";
      if (!isSafeBashCommand(command)) {
        if (ctx.hasUI) {
          ctx.ui.notify(`Blocked mutative bash command in Plan Mode: ${command}`, "warning");
        }
        return {
          block: true,
          reason: `Mutative bash command '${command}' is blocked in Plan Mode. Only read-only inspection commands are permitted.`,
        };
      }
    }

    return undefined;
  });

  // 2. Register Slash Command /plan
  pi.registerCommand("plan", {
    description: "Toggle read-only plan mode: /plan [on|off]",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const arg = args.trim().toLowerCase();
      if (arg === "on" || arg === "enable") {
        enablePlanMode(ctx);
      } else if (arg === "off" || arg === "disable") {
        disablePlanMode(ctx);
      } else {
        if (isPlanMode) {
          disablePlanMode(ctx);
        } else {
          enablePlanMode(ctx);
        }
      }
    },
  });

  // 3. Register Shortcut Ctrl+Alt+P if supported
  if (pi.registerShortcut) {
    pi.registerShortcut("ctrl+alt+p", {
      description: "Toggle Plan Mode",
      handler: async (ctx: ExtensionContext) => {
        if (isPlanMode) {
          disablePlanMode(ctx);
        } else {
          enablePlanMode(ctx);
        }
      },
    });
  }

  // 4. Session Start hook
  pi.on("session_start", (_event, ctx) => {
    updatePlanUI(ctx);
  });
}
