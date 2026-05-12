import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  ensureQueueEntry,
  saveQueuePayload,
  requeueQueueEntry,
  shapeStatus,
  stateDbPath,
} from "../runtime";

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

test("released items can be requeued with fresh state", () => {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, "autobot-cli-requeue-"));
  const repoDir = path.join(tmpdir, "repo");
  fs.mkdirSync(path.join(repoDir, ".autobot"), { recursive: true });
  const workspacePath = path.join(tmpdir, "workspaces", "rep-2");
  fs.mkdirSync(workspacePath, { recursive: true });
  const originalRepoRoot = process.env.REPO_ROOT;
  process.env.REPO_ROOT = repoDir;

  try {
    saveQueuePayload({
      items: [
        {
          issue_identifier: "REP-2",
          claim_state: "released",
          workspace_path: workspacePath,
          attempt_count: 4,
          claimed_by: "someone-else",
          last_error: "boom",
          retry_reason: "manual retry",
          linear_sync_error: "sync failed",
          conditions: ["stale condition"],
          wait_conditions: ["stale wait"],
          issue_title: "Resume autobot work",
        },
      ],
    });

    const item = requeueQueueEntry("REP-2");
    assert.equal(item.claim_state, "queued");
    assert.equal(item.claimed_by, "autobot");
    assert.equal(item.attempt_count, 0);
    assert.equal(item.workspace_path, workspacePath);
    assert.equal(item.workspace_exists, true);
    assert.equal(item.issue_title, "Resume autobot work");
    assert.equal("last_error" in item, false);
    assert.equal("retry_reason" in item, false);
    assert.equal("linear_sync_error" in item, false);
    assert.equal("conditions" in item, false);
    assert.equal("wait_conditions" in item, false);

    const db = new DatabaseSync(stateDbPath(), { readOnly: true });
    try {
      const stored = db
        .prepare("select value from state where key = ?")
        .get("queue") as { value: string } | undefined;
      assert.ok(stored);
      const queue = JSON.parse(stored.value) as {
        items?: Array<Record<string, unknown>>;
      };
      assert.equal(queue.items?.[0]?.claim_state, "queued");
      assert.equal(queue.items?.[0]?.attempt_count, 0);
      assert.equal(queue.items?.[0]?.workspace_path, workspacePath);
      assert.equal(queue.items?.[0]?.workspace_exists, true);
      assert.equal("last_error" in (queue.items?.[0] ?? {}), false);
      assert.equal("retry_reason" in (queue.items?.[0] ?? {}), false);
      assert.equal("linear_sync_error" in (queue.items?.[0] ?? {}), false);
      assert.equal("conditions" in (queue.items?.[0] ?? {}), false);
      assert.equal("wait_conditions" in (queue.items?.[0] ?? {}), false);
    } finally {
      db.close();
    }

    assert.throws(() => requeueQueueEntry("../../tmp/payload"));
  } finally {
    if (originalRepoRoot === undefined) {
      delete process.env.REPO_ROOT;
    } else {
      process.env.REPO_ROOT = originalRepoRoot;
    }
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("released items with blank workspace paths fall back to sibling worktrees", () => {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(
    path.join(tmpRoot, "autobot-cli-requeue-blank-"),
  );
  const repoDir = path.join(tmpdir, "repo");
  fs.mkdirSync(path.join(repoDir, ".autobot"), { recursive: true });
  const originalRepoRoot = process.env.REPO_ROOT;
  process.env.REPO_ROOT = repoDir;

  try {
    saveQueuePayload({
      items: [
        {
          issue_identifier: "REP-3",
          claim_state: "released",
          workspace_path: "",
          attempt_count: 2,
        },
      ],
    });

    const item = requeueQueueEntry("REP-3");
    assert.equal(
      item.workspace_path,
      path.resolve(path.dirname(repoDir), "repro-wt-rep-3"),
    );
    assert.equal(item.workspace_exists, false);
  } finally {
    if (originalRepoRoot === undefined) {
      delete process.env.REPO_ROOT;
    } else {
      process.env.REPO_ROOT = originalRepoRoot;
    }
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});
