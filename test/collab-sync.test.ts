import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

test("collaboration sync: tabs, per-tab text, and files round-trip through the relay", () => {
  const harness = path.join(import.meta.dirname, "collab-sync.harness.mts");
  const res = spawnSync(
    process.execPath,
    ["--experimental-test-module-mocks", "--no-warnings", "--import", "tsx", harness],
    { cwd: path.join(import.meta.dirname, ".."), encoding: "utf8", timeout: 60_000 }
  );
  assert.equal(res.status, 0, `harness failed:\n${res.stdout}\n${res.stderr}`);
  assert.match(res.stdout, /ALL SYNC CHECKS PASSED/);
});
