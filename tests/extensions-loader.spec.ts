import assert from "node:assert";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import agyExtension from "../extensions/agy.ts";
import cavemanExtension from "../extensions/caveman.ts";
import designTwiceExtension from "../extensions/design-twice.ts";
import diagnoseExtension from "../extensions/diagnose.ts";
import grillExtension from "../extensions/grill.ts";
import mcpBridgeExtension from "../extensions/mcp-bridge.ts";
import planModeExtension from "../extensions/plan-mode.ts";
import safetyGuardExtension from "../extensions/safety-guard.ts";
import sddExtension from "../extensions/sdd.ts";
import subagentExtension from "../extensions/subagent.ts";
import tddExtension from "../extensions/tdd.ts";

const EXTENSIONS = [
  { name: "agy", factory: agyExtension },
  { name: "caveman", factory: cavemanExtension },
  { name: "design-twice", factory: designTwiceExtension },
  { name: "diagnose", factory: diagnoseExtension },
  { name: "grill", factory: grillExtension },
  { name: "mcp-bridge", factory: mcpBridgeExtension },
  { name: "plan-mode", factory: planModeExtension },
  { name: "safety-guard", factory: safetyGuardExtension },
  { name: "sdd", factory: sddExtension },
  { name: "subagent", factory: subagentExtension },
  { name: "tdd", factory: tddExtension },
];

test("all 11 extensions load cleanly into Pi runtime harness without errors", () => {
  const registeredTools = new Set<string>();
  const registeredCommands = new Set<string>();
  const registeredEvents = new Set<string>();

  const mockPi: Partial<ExtensionAPI> = {
    registerTool: (tool: any) => {
      assert.ok(tool.name, "Registered tool must have a name");
      registeredTools.add(tool.name);
    },
    registerCommand: (name: string, def: any) => {
      assert.ok(name, "Registered command must have a name");
      assert.ok(
        typeof def.handler === "function",
        "Registered command must have a handler function",
      );
      registeredCommands.add(name);
    },
    registerShortcut: () => {},
    on: ((event: string) => {
      registeredEvents.add(event);
      return () => {};
    }) as any,
    getActiveTools: () => ["read", "write", "edit", "bash"],
    setActiveTools: () => {},
  };

  for (const { name, factory } of EXTENSIONS) {
    assert.strictEqual(
      typeof factory,
      "function",
      `Extension '${name}' must export a factory function`,
    );
    assert.doesNotThrow(() => {
      factory(mockPi as ExtensionAPI);
    }, `Extension '${name}' must initialize without throwing`);
  }

  // Verify critical tools and commands were registered
  assert.ok(registeredCommands.has("sdd"), "sdd command registered");
  assert.ok(registeredCommands.has("tdd"), "tdd command registered");
  assert.ok(registeredCommands.has("diagnose"), "diagnose command registered");
  assert.ok(registeredCommands.has("plan"), "plan command registered");
  assert.ok(registeredCommands.has("safety"), "safety command registered");
  assert.ok(registeredCommands.has("caveman"), "caveman command registered");

  assert.ok(registeredTools.has("agy"), "agy tool registered");
  assert.ok(registeredTools.has("subagent"), "subagent tool registered");
  assert.ok(
    registeredTools.has("design_interface_options"),
    "design_interface_options tool registered",
  );
  assert.ok(
    registeredTools.has("record_domain_decision"),
    "record_domain_decision tool registered",
  );
  assert.ok(registeredTools.has("mcp"), "mcp tool registered");
  assert.ok(registeredTools.has("verify_tdd_step"), "verify_tdd_step tool registered");
  assert.ok(registeredTools.has("complete_diagnosis"), "complete_diagnosis tool registered");
});
