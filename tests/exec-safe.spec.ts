import assert from "node:assert";
import test from "node:test";
import {
  extractBashMutationTargets,
  handleOutputTruncation,
  runSafeProcess,
  tokenizeArgs,
} from "../extensions/shared/exec-safe.ts";

test("tokenizeArgs splits commands while respecting single and double quotes", () => {
  const result = tokenizeArgs("node -e \"console.log('hello world')\" --flag='value with space'");
  assert.strictEqual(result.length, 4);
  assert.strictEqual(result[0], "node");
  assert.strictEqual(result[1], "-e");
  assert.strictEqual(result[2], "console.log('hello world')");
  assert.strictEqual(result[3], "--flag=value with space");
});

test("extractBashMutationTargets extracts multiple redirections and skips fd dups", () => {
  const cmd = "echo 'foo' > file1.txt && cat file2.txt 2>&1 | tee -a file3.log >> file4.out";
  const targets = extractBashMutationTargets(cmd);
  assert.deepStrictEqual(targets.sort(), ["file1.txt", "file3.log", "file4.out"].sort());
});

test("extractBashMutationTargets extracts sed -i, rm, mv, and touch targets", () => {
  const cmd = "sed -i 's/foo/bar/g' config.json && rm -rf .git && mv old.ts new.ts && touch .env";
  const targets = extractBashMutationTargets(cmd);
  assert.deepStrictEqual(
    targets.sort(),
    [".env", ".git", "config.json", "new.ts", "old.ts"].sort(),
  );
});

test("runSafeProcess executes command and captures exit code and stdout", async () => {
  const res = await runSafeProcess({
    binaryPath: "node",
    args: ["-e", "process.stdout.write('pi-safe-test')"],
    cwd: process.cwd(),
    timeoutSeconds: 10,
  });

  assert.strictEqual(res.exitCode, 0);
  assert.strictEqual(res.stdout, "pi-safe-test");
  assert.strictEqual(res.timedOut, false);
  assert.strictEqual(res.aborted, false);
});

test("runSafeProcess handles non-zero exit codes cleanly without throwing", async () => {
  const res = await runSafeProcess({
    binaryPath: "node",
    args: ["-e", "process.exit(42)"],
    cwd: process.cwd(),
    timeoutSeconds: 10,
  });

  assert.strictEqual(res.exitCode, 42);
  assert.strictEqual(res.timedOut, false);
});

test("runSafeProcess enforces timeout cancellation", async () => {
  const res = await runSafeProcess({
    binaryPath: "node",
    args: ["-e", "setTimeout(() => {}, 10000)"],
    cwd: process.cwd(),
    timeoutSeconds: 1,
  });

  assert.strictEqual(res.timedOut, true);
});

test("handleOutputTruncation keeps short text inline without file spill", async () => {
  const shortText = "Small diagnostic output";
  const result = await handleOutputTruncation(shortText, "unit-test");
  assert.strictEqual(result.truncated, false);
  assert.strictEqual(result.resultText, shortText);
});
