import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import diagnoseExtension from "../extensions/diagnose.ts";

test("diagnose extension tracks instrumented files and blocks completion on lingering debug probes", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-diagnose-test-"));

  try {
    const tools: Record<string, any> = {};
    const mockPi: any = {
      registerTool: (tool: any) => {
        tools[tool.name] = tool;
      },
      registerCommand: () => {},
      on: () => {},
    };

    diagnoseExtension(mockPi);

    assert.ok(
      tools.track_diagnostic_instrumentation,
      "track_diagnostic_instrumentation tool must be registered",
    );
    assert.ok(tools.complete_diagnosis, "complete_diagnosis tool must be registered");

    const mockCtx: any = { cwd: tmpDir };

    // 1. Create a source file with a temporary debug probe
    const srcDir = path.join(tmpDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const fileWithLog = path.join(srcDir, "auth.ts");
    fs.writeFileSync(
      fileWithLog,
      "export function login() {\n  console.log('TEMP PROBE: login called');\n  return true;\n}\n",
      "utf8",
    );

    // 2. Track instrumentation on this file
    const trackRes = await tools.track_diagnostic_instrumentation.execute(
      "call-track-1",
      { file: "src/auth.ts", action: "add" },
      undefined,
      undefined,
      mockCtx,
    );
    assert.strictEqual(trackRes.details.activeCount, 1);

    // 3. Attempt to complete diagnosis while probe is still present -> MUST throw error
    await assert.rejects(
      async () => {
        await tools.complete_diagnosis.execute(
          "call-complete-1",
          {
            regressionCommand: "node -e 'process.exit(0)'",
            rootCauseSummary: "Fixed null check in token validation.",
          },
          undefined,
          undefined,
          mockCtx,
        );
      },
      (err: Error) => {
        assert.ok(err.message.includes("Lingering debug instrumentation detected"));
        assert.ok(err.message.includes("src/auth.ts"));
        return true;
      },
    );

    // 4. Strip the debug probe from auth.ts
    fs.writeFileSync(fileWithLog, "export function login() {\n  return true;\n}\n", "utf8");

    // 5. Complete diagnosis with passing test command -> MUST succeed and reset state
    const completeRes = await tools.complete_diagnosis.execute(
      "call-complete-2",
      {
        regressionCommand: "node -e 'process.exit(0)'",
        rootCauseSummary: "Cleaned debug probe and verified fix.",
      },
      undefined,
      undefined,
      mockCtx,
    );

    assert.strictEqual(completeRes.details.resolved, true);
    assert.strictEqual(completeRes.details.remainingInstrumented, 0);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
