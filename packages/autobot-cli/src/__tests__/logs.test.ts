import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { saveQueuePayload } from "../runtime";
import { runAutobot } from "../commands/autobot";
import { runAutobotEngine } from "../commands/autobot-engine";

function makeRepoRoot(): {
  restore: () => void;
  repoDir: string;
  tmpdir: string;
} {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, "autobot-cli-logs-"));
  const repoDir = path.join(tmpdir, "repo");
  fs.mkdirSync(path.join(repoDir, ".autobot"), { recursive: true });
  const originalRepoRoot = process.env.REPO_ROOT;
  const originalJson = process.env.REPROCTL_JSON;
  process.env.REPO_ROOT = repoDir;

  return {
    repoDir,
    tmpdir,
    restore: () => {
      if (originalRepoRoot === undefined) {
        delete process.env.REPO_ROOT;
      } else {
        process.env.REPO_ROOT = originalRepoRoot;
      }
      if (originalJson === undefined) {
        delete process.env.REPROCTL_JSON;
      } else {
        process.env.REPROCTL_JSON = originalJson;
      }
      fs.rmSync(tmpdir, { recursive: true, force: true });
    },
  };
}

test("engine activity is logged and surfaced by autobot logs as raw lines", () => {
  const { restore, tmpdir } = makeRepoRoot();
  const writes: string[] = [];
  const write = test.mock.method(
    process.stdout,
    "write",
    (chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    },
  );
  const workspacePath = path.join(tmpdir, "workspaces", "rep-1");
  fs.mkdirSync(workspacePath, { recursive: true });

  saveQueuePayload({
    items: [
      {
        issue_identifier: "REP-1",
        claim_state: "queued",
        workspace_path: workspacePath,
        linear: { issue: { title: "Build autobot logs" } },
      },
    ],
  });

  try {
    runAutobotEngine(["node", "autobot-engine", "start", "--once"]);
    writes.length = 0;
    runAutobot(["node", "autobot", "logs"]);
    const logs = writes.join("").trim();
    assert.throws(() => JSON.parse(logs));
    assert.equal(logs.includes("task-success"), true);
    assert.equal(logs.includes(".autobot/engine.log"), false);
    assert.equal(logs.startsWith("{"), false);

    writes.length = 0;
    runAutobot(["node", "autobot", "status", "REP-1"]);
    const detail = writes.join("");
    assert.equal(detail.includes("HISTORY"), true);
    assert.equal(detail.includes("task-success"), true);
  } finally {
    write.mock.restore();
    restore();
  }
});

test("engine failures are surfaced in logs and status history", () => {
  const { restore, tmpdir } = makeRepoRoot();
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
        issue_identifier: "REP-2",
        claim_state: "running",
        workspace_path: path.join(tmpdir, "missing-workspace"),
      },
    ],
  });

  try {
    runAutobotEngine(["node", "autobot-engine", "start", "--once"]);

    writes.length = 0;
    runAutobot(["node", "autobot", "logs", "REP-2"]);
    const logs = writes.join("").trim();
    assert.throws(() => JSON.parse(logs));
    assert.equal(logs.includes("REP-2"), true);
    assert.equal(logs.includes("missing-workspace"), true);

    writes.length = 0;
    runAutobot(["node", "autobot", "status", "REP-2", "--json"]);
    const detail = JSON.parse(writes.join("").trim()) as {
      issue: { reason?: string } | null;
      history: string[];
      logs: string[];
    };
    assert.ok(detail.issue);
    assert.equal(detail.issue?.reason?.includes("retry"), true);
    assert.equal(
      detail.issue?.reason?.includes(path.join(tmpdir, "missing-workspace")),
      true,
    );
    assert.equal(
      detail.history.some(
        (line) =>
          line.includes("attempted=retry") &&
          line.includes(path.join(tmpdir, "missing-workspace")),
      ),
      true,
    );
  } finally {
    write.mock.restore();
    restore();
  }
});
