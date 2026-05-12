import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { ensureQueueEntry, shapeStatus, stateDbPath } from "../runtime";

test("status shaping hides terminal items while preserving summary", () => {
  const status = shapeStatus({
    items: [
      { issue_identifier: "REP-1", claim_state: "queued" },
      { issue_identifier: "REP-2", claim_state: "canceled" },
      { issue_identifier: "REP-3", claim_state: "developing" },
    ],
  });

  assert.deepEqual(
    status.items.map((item) => item.issue_identifier),
    ["REP-1", "REP-3"],
  );
  assert.equal(status.summary.total, 3);
  assert.equal(status.summary.running, 1);
  assert.equal(status.summary.canceled, 1);
});

test("queued items use sibling worktree paths and validated issue ids", () => {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, "autobot-cli-queue-"));
  const repoDir = path.join(tmpdir, "repo");
  fs.mkdirSync(path.join(repoDir, ".autobot"), { recursive: true });
  const originalRepoRoot = process.env.REPO_ROOT;
  process.env.REPO_ROOT = repoDir;

  try {
    const item = ensureQueueEntry("REP-1");
    assert.equal(
      item.workspace_path,
      path.resolve(path.dirname(repoDir), "repro-wt-rep-1"),
    );
    assert.equal(fs.existsSync(stateDbPath()), true);
    const db = new DatabaseSync(stateDbPath(), { readOnly: true });
    try {
      const stored = db
        .prepare("select value from state where key = ?")
        .get("queue") as { value: string } | undefined;
      assert.ok(stored);
      assert.equal(JSON.parse(stored.value).items[0].issue_identifier, "REP-1");
    } finally {
      db.close();
    }
    assert.throws(() => ensureQueueEntry("../../tmp/payload"));
  } finally {
    if (originalRepoRoot === undefined) {
      delete process.env.REPO_ROOT;
    } else {
      process.env.REPO_ROOT = originalRepoRoot;
    }
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});
