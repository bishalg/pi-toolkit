/**
 * Caveman Mode Pi Extension (Token-Saver Mode)
 *
 * Upgrades Matt Pocock's caveman skill into an active runtime toggle:
 * - Drops filler words, pleasantries, and unnecessary articles
 * - Cuts response token volume by ~75% while keeping 100% technical and code precision
 * - Toggles via /caveman command or shortcut
 * - Renders '⚡ CAVEMAN' in the TUI status bar
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

const CAVEMAN_PROMPT_DIRECTIVE =
  `CAVEMAN MODE ACTIVE (Token Optimization):\n` +
  `- Drop pleasantries, greetings, and conversational filler.\n` +
  `- Cut unnecessary articles (a, an, the) when context is unambiguous.\n` +
  `- Use concise, telegraphic sentences.\n` +
  `- PRESERVE 100% TECHNICAL ACCURACY, exact code blocks, and full TypeScript types.\n` +
  `- Example: "Fixed token expiry. Added null check on session. All 4 unit tests passing."`;

export default function cavemanExtension(pi: ExtensionAPI): void {
  let isCavemanActive = false;

  function updateTUI(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    if (isCavemanActive) {
      ctx.ui.setStatus("caveman", ctx.ui.theme.fg("muted", "⚡ CAVEMAN"));
    } else {
      ctx.ui.setStatus("caveman", undefined);
    }
  }

  // 1. Inject Ultra-Terse Directive via before_agent_start
  pi.on("before_agent_start", (event, ctx) => {
    if (!event.systemPromptOptions) {
      (event as unknown as Record<string, unknown>).systemPromptOptions = { sections: {} };
    }
    if (!event.systemPromptOptions.sections) {
      event.systemPromptOptions.sections = {};
    }

    if (isCavemanActive) {
      event.systemPromptOptions.sections.caveman = CAVEMAN_PROMPT_DIRECTIVE;
    } else {
      delete event.systemPromptOptions.sections.caveman;
    }
    updateTUI(ctx);
  });

  // Session start handler
  pi.on("session_start", (_event, ctx) => {
    updateTUI(ctx);
  });

  // 2. Command /caveman
  pi.registerCommand("caveman", {
    description: "Toggle ultra-terse token-saving response mode: /caveman [on|off]",
    getArgumentCompletions: (prefix: string) => {
      const opts = ["on", "off", "status"];
      const filtered = opts.filter((o) => o.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((v) => ({ value: v, label: v })) : null;
    },
    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      const arg = rawArgs.trim().toLowerCase();

      if (arg === "on") {
        isCavemanActive = true;
      } else if (arg === "off") {
        isCavemanActive = false;
      } else if (arg === "status") {
        ctx.ui.notify(
          `Caveman Mode is currently ${isCavemanActive ? "ENABLED (⚡ Ultra-Terse)" : "DISABLED"}`,
          "info",
        );
        return;
      } else {
        // Toggle
        isCavemanActive = !isCavemanActive;
      }

      updateTUI(ctx);
      ctx.ui.notify(
        `⚡ Caveman Mode ${isCavemanActive ? "ENABLED (~75% token reduction)" : "DISABLED"}`,
        isCavemanActive ? "info" : "warning",
      );
    },
  });

  // 3. Register Shortcut: Ctrl+Alt+C
  pi.registerShortcut("ctrl+alt+c", {
    description: "Toggle Caveman token-saving mode",
    handler: async (ctx: ExtensionContext) => {
      isCavemanActive = !isCavemanActive;
      updateTUI(ctx);
      if (ctx.hasUI) {
        ctx.ui.notify(
          `⚡ Caveman Mode ${isCavemanActive ? "ENABLED" : "DISABLED"}`,
          isCavemanActive ? "info" : "warning",
        );
      }
    },
  });
}
