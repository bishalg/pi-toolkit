import assert from "node:assert";
import test from "node:test";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import cavemanExtension from "../extensions/caveman.ts";

test("caveman extension toggles active state and injects ultra-terse prompt directive", async () => {
  let beforeAgentStartHandler: (event: any, ctx: ExtensionContext) => void;
  let commandHandler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;

  const mockPi: Partial<ExtensionAPI> = {
    on: ((event: string, handler: any) => {
      if (event === "before_agent_start") beforeAgentStartHandler = handler;
      return () => {};
    }) as any,
    registerCommand: (name: string, def: any) => {
      if (name === "caveman") commandHandler = def.handler;
    },
    registerShortcut: () => {},
  };

  cavemanExtension(mockPi as ExtensionAPI);

  const mockCtx: Partial<ExtensionCommandContext> = {
    cwd: process.cwd(),
    hasUI: false,
    ui: {
      setStatus: () => {},
      notify: () => {},
      theme: { fg: (_c: string, text: string) => text } as any,
    } as any,
  };

  // 1. Initial agent start: caveman is off
  const event1: any = { systemPromptOptions: { sections: {} } };
  beforeAgentStartHandler!(event1, mockCtx as ExtensionContext);
  assert.strictEqual(event1.systemPromptOptions.sections.caveman, undefined);

  // 2. Toggle caveman ON
  await commandHandler!("on", mockCtx as ExtensionCommandContext);

  // 3. Agent start with caveman ON: directive must be injected
  const event2: any = { systemPromptOptions: { sections: {} } };
  beforeAgentStartHandler!(event2, mockCtx as ExtensionContext);
  assert.ok(event2.systemPromptOptions.sections.caveman);
  assert.ok(event2.systemPromptOptions.sections.caveman.includes("CAVEMAN MODE ACTIVE"));

  // 4. Test null-safety when systemPromptOptions is not yet initialized
  const eventEmpty: any = {};
  beforeAgentStartHandler!(eventEmpty, mockCtx as ExtensionContext);
  assert.ok(eventEmpty.systemPromptOptions.sections.caveman);

  // 5. Toggle caveman OFF
  await commandHandler!("off", mockCtx as ExtensionCommandContext);
  const event3: any = { systemPromptOptions: { sections: {} } };
  beforeAgentStartHandler!(event3, mockCtx as ExtensionContext);
  assert.strictEqual(event3.systemPromptOptions.sections.caveman, undefined);
});
