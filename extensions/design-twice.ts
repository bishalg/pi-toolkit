/**
 * "Design It Twice" Parallel Interface Explorer Pi Extension
 *
 * Upgrades Matt Pocock's design-an-interface skill:
 * - Spawns parallel headless worker processes exploring radically different interface archetypes:
 *   1. Minimal / Functional (pure, composable, flat)
 *   2. Stateful / Class-Based (encapsulated, builder/fluent)
 *   3. Event-Driven / Reactive (high-performance, streaming, zero-allocation)
 * - Synthesizes results side-by-side with trade-off analysis and recommendation
 * - Exposes /design-twice command with interactive TUI selector
 */

import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { handleOutputTruncation, resolveBinary, runSafeProcess } from "./shared/exec-safe.js";

// ---------------------------------------------------------------------------
// Parameters & Types
// ---------------------------------------------------------------------------

export const DesignTwiceParams = Type.Object({
  description: Type.String({
    description: "Detailed description of the module, API, or service to design interfaces for.",
  }),
  variants: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Optional custom architectural archetypes (defaults to Functional, Stateful, Reactive).",
    }),
  ),
});

export type DesignTwiceInput = Static<typeof DesignTwiceParams>;

export interface DesignVariantResult {
  archetype: string;
  proposal: string;
  durationMs: number;
}

export interface DesignTwiceDetails {
  description: string;
  variants: DesignVariantResult[];
  recommendation: string;
}

// ---------------------------------------------------------------------------
// Worker Runner
// ---------------------------------------------------------------------------

interface ArchetypeSpec {
  name: string;
  directive: string;
}

const DEFAULT_ARCHETYPES: ArchetypeSpec[] = [
  {
    name: "Design A: Minimal / Functional",
    directive:
      "Design a pure, minimal, functional TypeScript interface. Emphasize immutability, flat composable functions, zero side-effects, and smallest possible API surface.",
  },
  {
    name: "Design B: Stateful / Object-Oriented",
    directive:
      "Design an encapsulated, class-based TypeScript interface. Emphasize lifecycle management, fluent builder methods, strong type encapsulation, and domain model richness.",
  },
  {
    name: "Design C: High-Performance / Reactive",
    directive:
      "Design an event-driven, high-performance TypeScript interface. Emphasize signals/subscriptions, streaming or observable primitives, zero-allocation hot paths, and batching.",
  },
];

async function runDesignWorker(
  archetype: ArchetypeSpec,
  description: string,
  cwd: string,
  signal?: AbortSignal,
): Promise<DesignVariantResult> {
  const binaryPath = resolveBinary("pi") || "pi";

  const workerPrompt =
    `You are an expert TypeScript API architect.\n` +
    `Task: ${archetype.directive}\n` +
    `Target Module / Service: ${description}\n\n` +
    `Format your response concisely:\n` +
    `1. Clean TypeScript Interface definition (\`\`\`typescript ... \`\`\`)\n` +
    `2. Top 2 advantages\n` +
    `3. Top 2 drawbacks / limitations\n` +
    `4. Best suited for (1 sentence)\n` +
    `Do not write conversational filler.`;

  const raw = await runSafeProcess({
    binaryPath,
    args: ["-p", "--no-session", workerPrompt],
    cwd,
    timeoutSeconds: 90,
    signal,
  });

  let output = raw.stdout.trim() || raw.stderr.trim();

  // If pi output contains json lines, clean up
  if (output.includes('{"type":') || output.includes('"content":')) {
    const lines = output.split("\n");
    const extracted: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.content && typeof parsed.content === "string") {
          extracted.push(parsed.content);
        }
      } catch {
        if (line.trim()) extracted.push(line);
      }
    }
    if (extracted.length > 0) output = extracted.join("\n");
  }

  return {
    archetype: archetype.name,
    proposal: output || "Failed to generate design proposal.",
    durationMs: raw.durationMs,
  };
}

// ---------------------------------------------------------------------------
// Extension Factory
// ---------------------------------------------------------------------------

export default function designTwiceExtension(pi: ExtensionAPI): void {
  // 1. Register Tool: design_interface_options
  pi.registerTool({
    name: "design_interface_options",
    label: "Design Interface Options",
    description:
      "Spawns parallel headless processes to explore radically different TypeScript interface shapes (Functional, Stateful, Reactive) before locking down architecture.",
    promptSnippet: "Explore multiple competing TypeScript API designs in parallel",
    promptGuidelines: [
      "Use 'design_interface_options' before finalizing /sdd plan when designing non-trivial modules or public APIs.",
      "Compares Functional vs. Stateful vs. Reactive designs side-by-side.",
    ],
    parameters: DesignTwiceParams,
    async execute(
      _toolCallId,
      params,
      signal,
      onUpdate,
      ctx,
    ): Promise<AgentToolResult<DesignTwiceDetails>> {
      if (onUpdate) {
        onUpdate({
          content: [{ type: "text", text: "Spawning parallel interface design workers..." }],
          details: {
            description: params.description,
            variants: [],
            recommendation: "Analyzing...",
          },
        });
      }

      const results = await Promise.all(
        DEFAULT_ARCHETYPES.map((arch) =>
          runDesignWorker(arch, params.description, ctx.cwd, signal),
        ),
      );

      let markdown = `# 🎨 Interface Design Options: ${params.description}\n\n`;

      for (const res of results) {
        markdown += `## ${res.archetype}\n\n${res.proposal}\n\n---\n\n`;
      }

      markdown +=
        `## ⚖️ Synthesis & Recommendation\n\n` +
        `• **Choose Design A (Functional)** if this module operates as pure utility logic with simple inputs and outputs.\n` +
        `• **Choose Design B (Stateful)** if the module manages stateful connections, local caches, or multi-step configuration.\n` +
        `• **Choose Design C (Reactive)** if the module handles real-time streams, high-frequency events, or background subscriptions.\n`;

      const truncated = await handleOutputTruncation(markdown, "design-twice");

      return {
        content: [{ type: "text", text: truncated.resultText }],
        details: {
          description: params.description,
          variants: results,
          recommendation:
            "Review the three archetypes above and pick the cleanest fit for the feature.",
        },
      };
    },
  });

  // 2. Register Slash Command: /design-twice
  pi.registerCommand("design-twice", {
    description:
      "Explore multiple competing TypeScript API designs in parallel: /design-twice <description>",
    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      let desc = rawArgs.trim();

      if (!desc && ctx.hasUI) {
        desc =
          (await ctx.ui.input("Enter module or service to design (e.g. Offline Sync Engine):")) ||
          "";
      }

      if (!desc) {
        ctx.ui.notify(
          "Please provide a module description: /design-twice <description>",
          "warning",
        );
        return;
      }

      if (ctx.hasUI) {
        ctx.ui.notify(`Exploring parallel interface designs for "${desc}"...`, "info");
      }

      const results = await Promise.all(
        DEFAULT_ARCHETYPES.map((arch) => runDesignWorker(arch, desc, ctx.cwd)),
      );

      let markdown = `### 🎨 Interface Exploration: ${desc}\n\n`;
      for (const res of results) {
        markdown += `#### ${res.archetype}\n\n${res.proposal}\n\n`;
      }

      if (pi.sendMessage) {
        pi.sendMessage({
          customType: "design-twice-results",
          content: markdown,
          display: true,
        });
      }

      if (ctx.hasUI) {
        const choice = await ctx.ui.select(`Select preferred interface direction for "${desc}":`, [
          "Design A: Minimal / Functional",
          "Design B: Stateful / Object-Oriented",
          "Design C: High-Performance / Reactive",
          "Hybrid: Combine elements of A and B",
          "Cancel / Decide later",
        ]);

        if (choice && !choice.startsWith("Cancel")) {
          ctx.ui.notify(`Selected: ${choice}. Proceed to /sdd plan with this direction.`, "info");
        }
      }
    },
  });
}
