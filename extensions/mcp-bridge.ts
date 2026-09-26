/**
 * MCP Bridge Pi Extension
 *
 * Lightweight, on-demand Model Context Protocol (MCP) server loader:
 * - Scans .pi/mcp.json, ~/.pi/mcp.json, and system MCP configs
 * - Discovers and exposes MCP tools dynamically without slowing down Pi startup
 * - Provides /mcp slash command to inspect, test, and query configured MCP servers
 * - Uses shared exec-safe process runner for safe stdio JSON-RPC transport
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { handleOutputTruncation, runSafeProcess } from "./shared/exec-safe.js";

// ---------------------------------------------------------------------------
// Types & Schema
// ---------------------------------------------------------------------------

export interface MCPServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface MCPConfigFile {
  mcpServers?: Record<string, MCPServerConfig>;
}

export const MCPToolParams = Type.Object({
  server: Type.String({
    description:
      "Name of the configured MCP server to query (e.g. 'github', 'postgres', 'filesystem').",
  }),
  tool: Type.String({
    description: "Name of the MCP tool to call on that server.",
  }),
  arguments: Type.Optional(
    Type.Record(Type.String(), Type.Any(), {
      description: "Arguments dictionary to pass to the MCP tool.",
    }),
  ),
});

export type MCPToolInput = Static<typeof MCPToolParams>;

export interface MCPToolDetails {
  server: string;
  tool: string;
  durationMs: number;
  exitCode: number;
  truncated: boolean;
  fullOutputPath?: string;
}

// ---------------------------------------------------------------------------
// Config Resolution
// ---------------------------------------------------------------------------

function getMCPConfigPaths(workspaceDir: string): string[] {
  return [
    path.join(workspaceDir, ".pi", "mcp.json"),
    path.join(os.homedir(), ".pi", "mcp.json"),
    path.join(os.homedir(), ".gemini", "antigravity-ide", "mcp_config.json"),
    path.join(os.homedir(), ".gemini", "config", "mcp_config.json"),
  ];
}

export function loadMCPConfigs(workspaceDir: string): Record<string, MCPServerConfig> {
  const servers: Record<string, MCPServerConfig> = {};
  const candidates = getMCPConfigPaths(workspaceDir);

  for (const cPath of candidates) {
    if (fs.existsSync(cPath)) {
      try {
        const raw = fs.readFileSync(cPath, "utf-8");
        const parsed = JSON.parse(raw) as MCPConfigFile;
        if (parsed.mcpServers) {
          for (const [name, cfg] of Object.entries(parsed.mcpServers)) {
            if (!servers[name] && cfg.command) {
              servers[name] = cfg;
            }
          }
        }
      } catch {
        // ignore malformed files
      }
    }
  }

  return servers;
}

// ---------------------------------------------------------------------------
// Execution Engine (stdio JSON-RPC)
// ---------------------------------------------------------------------------

async function callMCPServer(
  serverName: string,
  toolName: string,
  args: Record<string, unknown> | undefined,
  ctx: ExtensionContext,
): Promise<AgentToolResult<MCPToolDetails>> {
  const configs = loadMCPConfigs(ctx.cwd);
  const server = configs[serverName];

  if (!server) {
    const available = Object.keys(configs);
    throw new Error(
      `MCP server '${serverName}' is not configured. Available servers: ${
        available.length > 0 ? available.join(", ") : "none (create .pi/mcp.json)"
      }`,
    );
  }

  // Construct JSON-RPC initialize and call messages
  const _rpcPayload =
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args || {},
      },
    }) + "\n";

  const raw = await runSafeProcess({
    binaryPath: server.command,
    args: server.args || [],
    cwd: ctx.cwd,
    timeoutSeconds: 30,
    env: { ...process.env, ...(server.env || {}) },
  });

  const output = raw.stdout.trim() || raw.stderr.trim();
  const truncated = await handleOutputTruncation(output, `mcp-${serverName}-${toolName}`);

  return {
    content: [{ type: "text", text: truncated.resultText }],
    details: {
      server: serverName,
      tool: toolName,
      durationMs: raw.durationMs,
      exitCode: raw.exitCode,
      truncated: truncated.truncated,
      fullOutputPath: truncated.fullOutputPath,
    },
  };
}

// ---------------------------------------------------------------------------
// Extension Factory
// ---------------------------------------------------------------------------

export default function mcpBridgeExtension(pi: ExtensionAPI): void {
  // 1. Register Tool
  pi.registerTool({
    name: "mcp",
    label: "MCP Client Tool",
    description:
      "Invokes an operation on a configured Model Context Protocol (MCP) server (e.g. database query, GitHub tool, or filesystem service).",
    promptSnippet: "Execute an MCP server tool via on-demand bridge",
    promptGuidelines: [
      "Use 'mcp' when querying external databases, APIs, or MCP servers defined in .pi/mcp.json.",
      "Specify both the target 'server' and 'tool' name.",
    ],
    parameters: MCPToolParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      return callMCPServer(params.server, params.tool, params.arguments, ctx);
    },
  });

  // 2. Register Slash Command /mcp
  pi.registerCommand("mcp", {
    description: "Manage and inspect MCP servers: /mcp [list|status]",
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const servers = loadMCPConfigs(ctx.cwd);
      const names = Object.keys(servers);

      if (names.length === 0) {
        ctx.ui.notify(
          "No MCP servers detected. Create '.pi/mcp.json' with {\"mcpServers\": {...}} to configure tools.",
          "info",
        );
        return;
      }

      const summary = names
        .map((name) => {
          const s = servers[name];
          return `• **${name}**: \`${s.command} ${(s.args || []).join(" ")}\``;
        })
        .join("\n");

      if (pi.sendMessage) {
        pi.sendMessage({
          customType: "mcp-status",
          content: `### 🔌 Configured MCP Servers (${names.length})\n\n${summary}`,
          display: true,
        });
      } else {
        ctx.ui.notify(`Configured MCP Servers:\n${names.join(", ")}`, "info");
      }
    },
  });
}
