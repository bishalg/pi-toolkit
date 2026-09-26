import assert from "node:assert";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import safetyGuardExtension from "../extensions/safety-guard.ts";

test("safety-guard blocks direct write/edit tools to sensitive paths", async () => {
  let toolCallHandler: (event: any, ctx: ExtensionContext) => Promise<any>;

  const mockPi: Partial<ExtensionAPI> = {
    on: ((event: string, handler: any) => {
      if (event === "tool_call") {
        toolCallHandler = handler;
      }
      return () => {};
    }) as any,
    registerCommand: () => {},
  };

  safetyGuardExtension(mockPi as ExtensionAPI);

  const mockCtx: Partial<ExtensionContext> = {
    cwd: process.cwd(),
    hasUI: false,
  };

  // 1. Block write to .env
  const envRes = await toolCallHandler!(
    { toolName: "write", input: { path: ".env" } },
    mockCtx as ExtensionContext,
  );
  assert.ok(envRes?.block);
  assert.ok(envRes?.reason.includes("sensitive path '.env'"));

  // 2. Block edit to .git/config
  const gitRes = await toolCallHandler!(
    { toolName: "edit", input: { path: ".git/config" } },
    mockCtx as ExtensionContext,
  );
  assert.ok(gitRes?.block);
  assert.ok(gitRes?.reason.includes(".git"));

  // 3. Block write to certificate .pem
  const pemRes = await toolCallHandler!(
    { toolName: "replace_file_content", input: { file_path: "certs/server.pem" } },
    mockCtx as ExtensionContext,
  );
  assert.ok(pemRes?.block);

  // 4. Allow write to legitimate application file
  const appRes = await toolCallHandler!(
    { toolName: "write", input: { path: "src/calculator.ts" } },
    mockCtx as ExtensionContext,
  );
  assert.strictEqual(appRes, undefined);
});

test("safety-guard blocks bash mutations and destructive commands targeting protected files", async () => {
  let toolCallHandler: (event: any, ctx: ExtensionContext) => Promise<any>;

  const mockPi: Partial<ExtensionAPI> = {
    on: ((event: string, handler: any) => {
      if (event === "tool_call") {
        toolCallHandler = handler;
      }
      return () => {};
    }) as any,
    registerCommand: () => {},
  };

  safetyGuardExtension(mockPi as ExtensionAPI);

  const mockCtx: Partial<ExtensionContext> = {
    cwd: process.cwd(),
    hasUI: false,
  };

  // 1. Block echo redirection to .env
  const echoEnvRes = await toolCallHandler!(
    { toolName: "bash", input: { command: "echo 'API_KEY=123' > .env" } },
    mockCtx as ExtensionContext,
  );
  assert.ok(echoEnvRes?.block);
  assert.ok(echoEnvRes?.reason.includes("targets protected path '.env'"));

  // 2. Block pipe to tee targeting .env.local
  const teeEnvRes = await toolCallHandler!(
    { toolName: "bash", input: { command: "cat credentials.txt | tee -a .env.local" } },
    mockCtx as ExtensionContext,
  );
  assert.ok(teeEnvRes?.block);
  assert.ok(teeEnvRes?.reason.includes("targets protected path '.env.local'"));

  // 3. Block rm -rf .git
  const rmGitRes = await toolCallHandler!(
    { toolName: "bash", input: { command: "rm -rf .git" } },
    mockCtx as ExtensionContext,
  );
  assert.ok(rmGitRes?.block);

  // 4. Block git push --force in headless mode
  const forcePushRes = await toolCallHandler!(
    { toolName: "bash", input: { command: "git push origin main --force" } },
    mockCtx as ExtensionContext,
  );
  assert.ok(forcePushRes?.block);
  assert.ok(forcePushRes?.reason.includes("Dangerous command blocked"));

  // 5. Allow safe read-only bash command
  const safeBashRes = await toolCallHandler!(
    { toolName: "bash", input: { command: "git status" } },
    mockCtx as ExtensionContext,
  );
  assert.strictEqual(safeBashRes, undefined);
});
