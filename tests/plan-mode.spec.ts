import assert from "node:assert";
import test from "node:test";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import planModeExtension, { isSafeBashCommand } from "../extensions/plan-mode.ts";

test("plan-mode isSafeBashCommand accurately identifies read-only and mutative commands", () => {
  // Safe commands
  assert.strictEqual(isSafeBashCommand("git status"), true);
  assert.strictEqual(isSafeBashCommand("ls -la"), true);
  assert.strictEqual(isSafeBashCommand("cat package.json"), true);
  assert.strictEqual(isSafeBashCommand("git diff && git log -n 5"), true);
  assert.strictEqual(isSafeBashCommand("echo 'inspecting only'"), true);

  // Dangerous / mutative commands that must be blocked in Plan Mode
  assert.strictEqual(isSafeBashCommand("echo 'malicious' > src/app.ts"), false);
  assert.strictEqual(isSafeBashCommand("git status && rm -rf src/"), false);
  assert.strictEqual(isSafeBashCommand("cat foo | tee out.txt"), false);
  assert.strictEqual(isSafeBashCommand("git commit -m 'sneaky commit'"), false);
  assert.strictEqual(isSafeBashCommand("git push origin main"), false);
  assert.strictEqual(isSafeBashCommand("chmod +x script.sh"), false);
  assert.strictEqual(isSafeBashCommand("mkdir new-folder"), false);
});

test("plan-mode blocks file write tools and mutative bash commands when active", async () => {
  let toolCallHandler: (event: any, ctx: ExtensionContext) => Promise<any>;
  let planCommandHandler: (args: string, ctx: ExtensionCommandContext) => Promise<any>;

  const mockPi: Partial<ExtensionAPI> = {
    on: ((event: string, handler: any) => {
      if (event === "tool_call") toolCallHandler = handler;
      return () => {};
    }) as any,
    registerCommand: (cmd: string, def: any) => {
      if (cmd === "plan") planCommandHandler = def.handler;
    },
    getActiveTools: () => ["read", "write", "edit", "bash"],
    setActiveTools: () => {},
  };

  planModeExtension(mockPi as ExtensionAPI);

  const mockCtx: Partial<ExtensionCommandContext> = {
    cwd: process.cwd(),
    hasUI: false,
    ui: {
      notify: () => {},
      setStatus: () => {},
      theme: { fg: (_c: string, text: string) => text } as any,
    } as any,
  };

  // 1. When plan mode is OFF: write and bash are allowed
  const beforeWrite = await toolCallHandler!(
    { toolName: "write", input: { path: "src/app.ts" } },
    mockCtx as ExtensionContext,
  );
  assert.strictEqual(beforeWrite, undefined);

  // 2. Turn plan mode ON
  await planCommandHandler!("on", mockCtx as ExtensionCommandContext);

  // 3. In plan mode: write and edit are blocked
  const planWrite = await toolCallHandler!(
    { toolName: "write", input: { path: "src/app.ts" } },
    mockCtx as ExtensionContext,
  );
  assert.ok(planWrite?.block);
  assert.ok(planWrite?.reason.includes("Plan Mode is active"));

  // 4. In plan mode: safe bash command is allowed
  const planSafeBash = await toolCallHandler!(
    { toolName: "bash", input: { command: "git diff" } },
    mockCtx as ExtensionContext,
  );
  assert.strictEqual(planSafeBash, undefined);

  // 5. In plan mode: mutative bash command is blocked
  const planMutativeBash = await toolCallHandler!(
    { toolName: "bash", input: { command: "echo 'code' > src/app.ts" } },
    mockCtx as ExtensionContext,
  );
  assert.ok(planMutativeBash?.block);
  assert.ok(planMutativeBash?.reason.includes("Mutative bash command"));

  // 6. Turn plan mode OFF
  await planCommandHandler!("off", mockCtx as ExtensionCommandContext);

  const afterWrite = await toolCallHandler!(
    { toolName: "write", input: { path: "src/app.ts" } },
    mockCtx as ExtensionContext,
  );
  assert.strictEqual(afterWrite, undefined);
});
