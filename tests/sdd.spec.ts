import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sddExtension from "../extensions/sdd.ts";

test("sdd extension enforces hard tool guardrails per phase", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sdd-test-"));

  try {
    let toolCallHandler: any = null;
    let registeredCommand: any = null;

    const fakePi: any = {
      on: (event: string, handler: any) => {
        if (event === "tool_call") {
          toolCallHandler = handler;
        }
      },
      registerCommand: (name: string, def: any) => {
        if (name === "sdd") {
          registeredCommand = def;
        }
      },
    };

    sddExtension(fakePi);
    assert.ok(toolCallHandler, "tool_call handler should be registered");
    assert.ok(registeredCommand, "sdd command should be registered");

    const mockCtx: any = { cwd: tmpDir, hasUI: false };

    // 1. Initial idle phase: editing app code is allowed
    const idleWriteRes = await toolCallHandler(
      { toolName: "write", input: { path: "apps/web/src/index.ts" } },
      mockCtx,
    );
    assert.strictEqual(idleWriteRes, undefined, "Idle phase should not block app code write");

    // 2. Set phase to 'specify'
    fs.mkdirSync(path.join(tmpDir, ".pi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "sdd-state.json"),
      JSON.stringify({
        phase: "specify",
        activeFeature: "001-test-feature",
        activeFeatureDir: "specs/001-test-feature",
        updatedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    // 3. In specify phase: writing app code MUST be blocked
    const lockedWriteRes = await toolCallHandler(
      { toolName: "write", input: { path: "apps/web/src/index.ts" } },
      mockCtx,
    );
    assert.ok(lockedWriteRes?.block, "Specify phase MUST block write outside specs/");
    assert.ok(lockedWriteRes?.reason.includes("[SDD Enforcement]"));

    // 4. In specify phase: writing inside specs/ MUST be allowed
    const specWriteRes = await toolCallHandler(
      { toolName: "write", input: { path: "specs/001-test-feature/spec.md" } },
      mockCtx,
    );
    assert.strictEqual(specWriteRes, undefined, "Specify phase MUST allow write inside specs/");

    // 5. In specify phase: mutating app code via bash redirection or tee MUST be blocked
    const bashBlockedRes = await toolCallHandler(
      { toolName: "bash", input: { command: "echo 'code' > apps/web/src/main.ts" } },
      mockCtx,
    );
    assert.ok(
      bashBlockedRes?.block,
      "Bash redirection outside specs MUST be blocked in locked phase",
    );

    const chainedBlockedRes = await toolCallHandler(
      {
        toolName: "bash",
        input: { command: "echo 'ok' > specs/doc.md && echo 'hack' > apps/web/src/main.ts" },
      },
      mockCtx,
    );
    assert.ok(chainedBlockedRes?.block, "Chained bash redirection outside specs MUST be blocked");

    const teeBlockedRes = await toolCallHandler(
      { toolName: "bash", input: { command: "cat foo | tee apps/web/src/main.ts" } },
      mockCtx,
    );
    assert.ok(teeBlockedRes?.block, "Piped tee outside specs MUST be blocked");

    // 6. Set phase to 'implement'
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "sdd-state.json"),
      JSON.stringify({
        phase: "implement",
        activeFeature: "001-test-feature",
        activeFeatureDir: "specs/001-test-feature",
        updatedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    // 7. In implement phase: application code is UNLOCKED
    const implementWriteRes = await toolCallHandler(
      { toolName: "write", input: { path: "apps/web/src/index.ts" } },
      mockCtx,
    );
    assert.strictEqual(
      implementWriteRes,
      undefined,
      "Implement phase MUST unlock application code write",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
