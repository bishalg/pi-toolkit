import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import grillExtension from "../extensions/grill.ts";

test("grill extension registers tool and records domain terms with preamble preservation", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-grill-test-"));

  try {
    // 1. Prepopulate CONTEXT.md with a custom preamble
    const customPreamble = "# My Custom Project Preamble\n\nSpecific guidelines for the domain.";
    fs.writeFileSync(path.join(tmpDir, "CONTEXT.md"), `${customPreamble}\n\n---\n\n`, "utf8");

    let registeredTool: any = null;
    const fakePi: any = {
      registerTool: (tool: any) => {
        if (tool.name === "record_domain_decision") {
          registeredTool = tool;
        }
      },
      registerCommand: () => {},
    };

    grillExtension(fakePi);
    assert.ok(registeredTool, "record_domain_decision tool should be registered");

    // 2. Call record_domain_decision to register a new domain term
    const mockCtx: any = { cwd: tmpDir };
    const res = await registeredTool.execute(
      "call-1",
      {
        glossaryTerms: [
          {
            term: "OfflineSyncQueue",
            definition: "FIFO queue holding unsynced mutations while network is unreachable.",
            context: "Core sync engine",
          },
        ],
        adr: {
          title: "SQLite Storage Engine",
          context: "Need persistent local DB for mobile offline state.",
          decision: "Use SQLite with reactive WAL mode.",
          consequences: "Instant offline reads, minor disk space footprint.",
        },
      },
      undefined,
      undefined,
      mockCtx,
    );

    assert.strictEqual(res.details.glossaryUpdated, true);
    assert.strictEqual(res.details.termsCount, 1);
    assert.ok(res.details.adrPath.includes("0001-sqlite-storage-engine.md"));

    // 3. Verify CONTEXT.md preserved the custom preamble
    const updatedContent = fs.readFileSync(path.join(tmpDir, "CONTEXT.md"), "utf8");
    assert.ok(
      updatedContent.includes("My Custom Project Preamble"),
      "Must preserve custom preamble",
    );
    assert.ok(updatedContent.includes("### OfflineSyncQueue"), "Must include new term");
    assert.ok(
      updatedContent.includes("FIFO queue holding unsynced mutations"),
      "Must include definition",
    );

    // 4. Verify ADR file was created
    const adrAbs = path.join(tmpDir, res.details.adrPath);
    assert.ok(fs.existsSync(adrAbs), "ADR file should exist");
    const adrContent = fs.readFileSync(adrAbs, "utf8");
    assert.ok(adrContent.includes("SQLite Storage Engine"));
    assert.ok(adrContent.includes("Use SQLite with reactive WAL mode."));

    // 5. Call record_domain_decision a second time to ensure preamble separator is not duplicated
    await registeredTool.execute(
      "call-2",
      {
        glossaryTerms: [
          {
            term: "MerkleClock",
            definition: "Logical clock for distributed causal ordering.",
          },
        ],
      },
      undefined,
      undefined,
      mockCtx,
    );

    const secondContent = fs.readFileSync(path.join(tmpDir, "CONTEXT.md"), "utf8");
    const separatorCount = (secondContent.match(/^---$/gm) || []).length;
    assert.strictEqual(
      separatorCount,
      1,
      "Must contain exactly one '---' section separator, no duplicates",
    );
    assert.ok(secondContent.includes("### MerkleClock"));
    assert.ok(secondContent.includes("### OfflineSyncQueue"));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
