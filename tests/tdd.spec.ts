import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import tddExtension from "../extensions/tdd.ts";

test("tdd extension enforces hard RED -> GREEN state machine and tool locks", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tdd-test-"));

  try {
    let toolCallHandler: any = null;
    let verifyTool: any = null;

    const fakePi: any = {
      on: (event: string, handler: any) => {
        if (event === "tool_call") {
          toolCallHandler = handler;
        }
      },
      registerTool: (tool: any) => {
        if (tool.name === "verify_tdd_step") {
          verifyTool = tool;
        }
      },
      registerCommand: () => {},
    };

    tddExtension(fakePi);
    assert.ok(toolCallHandler, "tool_call handler should be registered");
    assert.ok(verifyTool, "verify_tdd_step tool should be registered");

    const mockCtx: any = { cwd: tmpDir, hasUI: false };

    // 1. Initialize TDD state in RED phase
    fs.mkdirSync(path.join(tmpDir, ".pi"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, ".pi", "tdd-state.json"),
      JSON.stringify({
        phase: "red",
        testCommand: "node -e 'process.exit(1)'",
        cyclesCompleted: 0,
        updatedAt: new Date().toISOString(),
      }),
      "utf8",
    );

    // 2. In RED phase: writing to source code must be blocked
    const redSourceRes = await toolCallHandler(
      { toolName: "write", input: { path: "src/calculator.ts" } },
      mockCtx,
    );
    assert.ok(redSourceRes?.block, "RED phase must block write to source file");
    assert.ok(redSourceRes?.reason.includes("[TDD RED Phase]"));

    // 3. In RED phase: writing to test file must be allowed
    const redTestRes = await toolCallHandler(
      { toolName: "write", input: { path: "src/calculator.spec.ts" } },
      mockCtx,
    );
    assert.strictEqual(redTestRes, undefined, "RED phase must allow write to test file");

    // 4. In RED phase: command not found (exitCode 127) must NOT transition to GREEN
    const errorCmdRes = await verifyTool.execute(
      "call-1",
      { customCommand: "non_existent_runner_xyz" },
      undefined,
      undefined,
      mockCtx,
    );
    assert.strictEqual(
      errorCmdRes.details.phaseAfter,
      "red",
      "Command failure should not advance to GREEN",
    );

    // 5. In RED phase: verify_tdd_step with failing test transitions to GREEN
    const failRes = await verifyTool.execute(
      "call-2",
      { customCommand: "node -e 'process.exit(1)'" },
      undefined,
      undefined,
      mockCtx,
    );
    assert.strictEqual(
      failRes.details.phaseAfter,
      "green",
      "Failing test must transition to GREEN",
    );

    // 6. In GREEN phase: modifying test file via edit or bash rm / sed is locked
    const greenTestRes = await toolCallHandler(
      { toolName: "edit", input: { path: "src/calculator.spec.ts" } },
      mockCtx,
    );
    assert.ok(greenTestRes?.block, "GREEN phase must lock test files");
    assert.ok(greenTestRes?.reason.includes("[TDD GREEN Phase]"));

    const greenBashRmTestRes = await toolCallHandler(
      { toolName: "bash", input: { command: "rm src/calculator.spec.ts" } },
      mockCtx,
    );
    assert.ok(greenBashRmTestRes?.block, "GREEN phase must block rm of test file");

    const greenBashTeeTestRes = await toolCallHandler(
      { toolName: "bash", input: { command: "cat /dev/null | tee src/calculator.spec.ts" } },
      mockCtx,
    );
    assert.ok(greenBashTeeTestRes?.block, "GREEN phase must block tee to test file");

    // 7. In GREEN phase: modifying source file is allowed
    const greenSourceRes = await toolCallHandler(
      { toolName: "write", input: { path: "src/calculator.ts" } },
      mockCtx,
    );
    assert.strictEqual(greenSourceRes, undefined, "GREEN phase must allow source code write");

    // 8. In GREEN phase: verify_tdd_step with passing test transitions to REFACTOR
    const passRes = await verifyTool.execute(
      "call-3",
      { customCommand: "node -e 'process.exit(0)'" },
      undefined,
      undefined,
      mockCtx,
    );
    assert.strictEqual(
      passRes.details.phaseAfter,
      "refactor",
      "Passing test in GREEN must transition to REFACTOR",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
