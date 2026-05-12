import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { saveQueuePayload } from "../runtime";
import { runAutobot } from "../commands/autobot";

function withRepoRoot(): { restore: () => void } {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, "autobot-cli-status-"));
  const repoDir = path.join(tmpdir, "repo");
  fs.mkdirSync(path.join(repoDir, ".autobot"), { recursive: true });
  const originalRepoRoot = process.env.REPO_ROOT;
  process.env.REPO_ROOT = repoDir;

  return {
    restore: () => {
      if (originalRepoRoot === undefined) {
        delete process.env.REPO_ROOT;
      } else {
        process.env.REPO_ROOT = originalRepoRoot;
      }
      fs.rmSync(tmpdir, { recursive: true, force: true });
    },
  };
}

test("status renders aggregate and single-issue detail views", () => {
  const { restore } = withRepoRoot();
  const writes: string[] = [];
  const write = test.mock.method(
    process.stdout,
    "write",
    (chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    },
  );

  saveQueuePayload({
    items: [
      {
        issue_identifier: "REP-1",
        claim_state: "queued",
        workspace_path: "/work/rep-1",
        linear: { issue: { title: "Migrate autobot CLI" } },
      },
      {
        issue_identifier: "REP-2",
        claim_state: "developing",
        workspace_path: "/work/rep-2",
        linear: { issue: { title: "Unblock engine loop" } },
      },
    ],
  });

  try {
    runAutobot(["node", "autobot", "status"]);
    const aggregate = writes.join("");
    assert.equal(
      aggregate.includes(
        "ID | STATE | TITLE | PRIORITY | ASSIGNEE | LABELS | WORKSPACE",
      ),
      false,
    );
    assert.equal(
      aggregate.includes("REP-1 | queued | Migrate autobot CLI"),
      false,
    );
    assert.equal(aggregate.includes("REP-1"), true);
    assert.equal(aggregate.includes("REP-2"), true);
    assert.equal(aggregate.includes("queued"), true);
    assert.equal(aggregate.includes("developing"), true);
    assert.equal(aggregate.includes("running"), false);
    assert.equal(aggregate.includes("┌"), true);
    assert.equal(aggregate.includes("│"), true);
    assert.equal(
      aggregate.includes("REP-2 | developing | Unblock engine loop"),
      false,
    );

    writes.length = 0;
    runAutobot(["node", "autobot", "status", "REP-1"]);
    const detail = writes.join("");
    assert.equal(detail.includes("STATUS REP-1"), true);
    assert.equal(detail.includes("DETAIL"), true);
    assert.equal(detail.includes("HISTORY"), true);
    assert.equal(detail.includes("LOGS"), true);
  } finally {
    write.mock.restore();
    restore();
  }
});
