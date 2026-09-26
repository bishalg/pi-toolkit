/**
 * Smart 3-Question Grill & Domain/ADR Engine Pi Extension
 *
 * Upgrades Matt Pocock's grill-me, grill-with-docs, and domain-modeling:
 * - Auto-decides ~80% of standard implementation details from existing code
 * - Strictly caps questions to 2-3 high-impact multiple-choice trade-offs
 * - Registers deterministic tool 'record_domain_decision' to update CONTEXT.md and docs/adr/
 * - Exposes /grill slash command
 */

import fs from "node:fs";
import path from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

// ---------------------------------------------------------------------------
// Tool Parameter Schema
// ---------------------------------------------------------------------------

export const RecordDomainDecisionParams = Type.Object({
  glossaryTerms: Type.Optional(
    Type.Array(
      Type.Object({
        term: Type.String({
          description: "Ubiquitous domain language term or concept name.",
        }),
        definition: Type.String({
          description: "Clear, unambiguous definition of the domain concept.",
        }),
        context: Type.Optional(
          Type.String({
            description: "Bounded context, domain scope, or usage rules.",
          }),
        ),
      }),
      {
        description: "Array of ubiquitous domain terms to register or update in CONTEXT.md.",
      },
    ),
  ),
  adr: Type.Optional(
    Type.Object({
      title: Type.String({
        description: "Short architectural decision title (e.g. 'Local SQLite Offline Storage').",
      }),
      status: Type.Optional(
        Type.String({
          description: "Decision status ('Accepted', 'Proposed', etc.). Defaults to 'Accepted'.",
        }),
      ),
      context: Type.String({
        description: "The business or technical problem motivating this decision.",
      }),
      decision: Type.String({
        description: "The chosen solution and why alternative options were rejected.",
      }),
      consequences: Type.String({
        description: "Trade-offs, positive and negative implications of this decision.",
      }),
    }),
  ),
});

export type RecordDomainDecisionInput = Static<typeof RecordDomainDecisionParams>;

export interface RecordDomainDecisionDetails {
  glossaryUpdated: boolean;
  termsCount: number;
  adrPath?: string;
}

// ---------------------------------------------------------------------------
// Helpers: CONTEXT.md (Glossary) & docs/adr/
// ---------------------------------------------------------------------------

interface GlossaryEntry {
  term: string;
  definition: string;
  context?: string;
}

function getContextFilePath(cwd: string): string {
  return path.join(cwd, "CONTEXT.md");
}

interface ParsedGlossary {
  preamble?: string;
  glossary: Map<string, GlossaryEntry>;
}

function parseExistingGlossary(cwd: string): ParsedGlossary {
  const glossary = new Map<string, GlossaryEntry>();
  const filePath = getContextFilePath(cwd);
  let preamble: string | undefined;

  if (!fs.existsSync(filePath)) return { glossary };

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const sections = raw.split(/^###\s+/m);

    if (sections[0] && sections[0].trim()) {
      preamble = sections[0].trim();
    }

    for (let i = 1; i < sections.length; i++) {
      const section = sections[i];
      if (!section.trim()) continue;
      const lines = section.split("\n");
      const term = lines[0].trim();
      if (!term || term.startsWith("#")) continue;

      let definition = "";
      let context: string | undefined;

      for (let j = 1; j < lines.length; j++) {
        const line = lines[j].trim();
        if (line.startsWith("- **Definition**:")) {
          definition = line.replace("- **Definition**:", "").trim();
        } else if (line.startsWith("- **Context**:")) {
          context = line.replace("- **Context**:", "").trim();
        }
      }

      if (definition) {
        glossary.set(term.toLowerCase(), { term, definition, context });
      }
    }
  } catch {
    // Non-fatal
  }

  return { preamble, glossary };
}

function writeGlossary(cwd: string, glossary: Map<string, GlossaryEntry>, preamble?: string): void {
  const filePath = getContextFilePath(cwd);
  const sorted = Array.from(glossary.values()).sort((a, b) => a.term.localeCompare(b.term));

  const cleanPreamble = preamble ? preamble.replace(/\n*---\s*$/, "").trim() : undefined;

  let out = cleanPreamble
    ? `${cleanPreamble}\n\n---\n\n`
    : `# Ubiquitous Language Glossary (CONTEXT.md)\n\nDomain terminology and shared concepts. Strictly contains business domain definitions without ephemeral implementation noise.\n\n---\n\n`;

  for (const entry of sorted) {
    out += `### ${entry.term}\n`;
    out += `- **Definition**: ${entry.definition}\n`;
    if (entry.context) {
      out += `- **Context**: ${entry.context}\n`;
    }
    out += `\n`;
  }

  fs.writeFileSync(filePath, out, "utf8");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getNextADRFilename(cwd: string, title: string): { filename: string; fullPath: string } {
  const adrDir = path.join(cwd, "docs", "adr");
  if (!fs.existsSync(adrDir)) {
    fs.mkdirSync(adrDir, { recursive: true });
  }

  let maxNum = 0;
  try {
    const files = fs.readdirSync(adrDir);
    for (const file of files) {
      const match = file.match(/^(\d{4})-(.+)\.md$/);
      if (match) {
        const num = Number.parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  } catch {
    maxNum = 0;
  }

  const nextNum = String(maxNum + 1).padStart(4, "0");
  const slug = slugify(title) || "architectural-decision";
  const filename = `${nextNum}-${slug}.md`;
  return { filename, fullPath: path.join(adrDir, filename) };
}

function writeADRFile(cwd: string, adr: NonNullable<RecordDomainDecisionInput["adr"]>): string {
  const { filename, fullPath } = getNextADRFilename(cwd, adr.title);
  const dateStr = new Date().toISOString().split("T")[0];
  const status = adr.status || "Accepted";

  const content =
    `# ${filename.replace(".md", "")}: ${adr.title}\n\n` +
    `**Date**: ${dateStr}  \n` +
    `**Status**: ${status}  \n\n` +
    `---\n\n` +
    `## Context\n\n${adr.context.trim()}\n\n` +
    `## Decision\n\n${adr.decision.trim()}\n\n` +
    `## Consequences\n\n${adr.consequences.trim()}\n`;

  fs.writeFileSync(fullPath, content, "utf8");
  return path.join("docs", "adr", filename);
}

// ---------------------------------------------------------------------------
// Extension Factory
// ---------------------------------------------------------------------------

export default function grillExtension(pi: ExtensionAPI): void {
  // 1. Register Tool: record_domain_decision
  pi.registerTool({
    name: "record_domain_decision",
    label: "Record Domain Terms & ADR",
    description:
      "Deterministically registers agreed domain terms into CONTEXT.md and writes architectural decision records into docs/adr/NNNN-decision.md.",
    promptSnippet:
      "Record resolved ubiquitous language terms in CONTEXT.md and save ADRs in docs/adr/",
    promptGuidelines: [
      "Use 'record_domain_decision' after grilling or clarifying domain terms and architectural trade-offs.",
      "Keep terms in CONTEXT.md domain-focused (no library names or ephemeral hooks).",
      "Write an ADR whenever choosing between mutually exclusive architectural options.",
    ],
    parameters: RecordDomainDecisionParams,
    async execute(
      _toolCallId,
      params,
      _signal,
      _onUpdate,
      ctx,
    ): Promise<AgentToolResult<RecordDomainDecisionDetails>> {
      let glossaryUpdated = false;
      let termsCount = 0;
      let adrPath: string | undefined;

      // Handle glossary terms
      if (params.glossaryTerms && params.glossaryTerms.length > 0) {
        const { preamble, glossary } = parseExistingGlossary(ctx.cwd);
        for (const item of params.glossaryTerms) {
          glossary.set(item.term.toLowerCase(), {
            term: item.term,
            definition: item.definition,
            context: item.context,
          });
        }
        writeGlossary(ctx.cwd, glossary, preamble);
        glossaryUpdated = true;
        termsCount = params.glossaryTerms.length;
      }

      // Handle ADR
      if (params.adr) {
        adrPath = writeADRFile(ctx.cwd, params.adr);
      }

      const summaryLines: string[] = [];
      if (glossaryUpdated) {
        summaryLines.push(`• Updated CONTEXT.md with ${termsCount} ubiquitous language term(s).`);
      }
      if (adrPath) {
        summaryLines.push(`• Created Architectural Decision Record: \`${adrPath}\`.`);
      }
      if (summaryLines.length === 0) {
        summaryLines.push("• No domain terms or ADR provided to record.");
      }

      return {
        content: [{ type: "text", text: summaryLines.join("\n") }],
        details: {
          glossaryUpdated,
          termsCount,
          adrPath,
        },
      };
    },
  });

  // 2. Register Slash Command: /grill
  pi.registerCommand("grill", {
    description:
      "Run Smart 3-Question Alignment Grill: auto-decides 80% from code, asks max 2-3 multiple-choice questions, updates CONTEXT.md & ADRs",
    handler: async (rawArgs: string, ctx: ExtensionCommandContext) => {
      const topic = rawArgs.trim();

      let targetTopic = topic;
      if (!targetTopic && ctx.hasUI) {
        targetTopic =
          (await ctx.ui.input(
            "Enter feature or architecture topic to grill (e.g. Offline Sync):",
          )) || "";
      }

      if (!targetTopic) {
        ctx.ui.notify("Please specify a topic to grill: /grill <topic-or-feature>", "warning");
        return;
      }

      // Read context files if present
      let contextSnippet = "";
      const contextPath = getContextFilePath(ctx.cwd);
      if (fs.existsSync(contextPath)) {
        try {
          const sample = fs.readFileSync(contextPath, "utf8").slice(0, 1000);
          contextSnippet = `\nExisting CONTEXT.md preview:\n${sample}\n`;
        } catch {
          // ignore
        }
      }

      const prompt =
        `### 🎯 Smart 3-Question Grill: ${targetTopic}\n\n` +
        `Perform high-leverage alignment for: **${targetTopic}**.\n\n` +
        `Follow this strict 3-phase execution:\n` +
        `1. **Phase 1: Silent Codebase Fact-Check (80% Auto-Decided)**\n` +
        `   - Scan the workspace, \`package.json\`, \`AGENTS.md\`, \`specs/\`, and existing architecture.\n` +
        `   - Output a bulleted **"Assumed Defaults"** summary of standard implementation details you already resolved from the codebase.\n\n` +
        `2. **Phase 2: Hard Cap of 2 to 3 Questions (Max 3, Never More)**\n` +
        `   - Identify only genuine architectural trade-offs, irreversible boundaries, or domain ambiguities.\n` +
        `   - Each question MUST present 2-3 options: \`[A]\`, \`[B]\`, \`[C]\`.\n` +
        `   - Always list \`[A] (Recommended)\` first with a 1-sentence trade-off rationale.\n` +
        `   - Ask the user to confirm or override choices.\n\n` +
        `3. **Phase 3: Deterministic Recording**\n` +
        `   - Once decisions are agreed upon, call the \`record_domain_decision\` tool to persist domain terms into \`CONTEXT.md\` and write any architectural trade-off into \`docs/adr/\`.\n` +
        contextSnippet;

      if (pi.sendMessage) {
        pi.sendMessage({
          customType: "grill-prompt",
          content: prompt,
          display: true,
        });
      } else {
        ctx.ui.notify(`Grill initiated for "${targetTopic}". Checking codebase...`, "info");
      }
    },
  });
}
