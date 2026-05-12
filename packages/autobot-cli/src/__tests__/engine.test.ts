import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import {
  holdEngineLoop,
  setConfigValue,
  saveQueuePayload,
  stateDbPath,
  shapeEngineStatus,
  startEngine,
  stopEngine,
} from "../runtime";
import { runAutobot } from "../commands/autobot";
import { runAutobotEngine } from "../commands/autobot-engine";

function workspacePath(tmpdir: string, issue: string): string {
  const workspace = path.join(tmpdir, "workspaces", issue.toLowerCase());
  fs.mkdirSync(workspace, { recursive: true });
  return workspace;
}

test("engine status keeps parallel active work only", () => {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, "autobot-cli-engine-"));
  const repoDir = path.join(tmpdir, "repo");
  fs.mkdirSync(path.join(repoDir, ".autobot"), { recursive: true });
  const originalRepoRoot = process.env.REPO_ROOT;
  process.env.REPO_ROOT = repoDir;

  try {
    saveQueuePayload({
      items: [
        {
          issue_identifier: "REP-2",
          claim_state: "developing",
          workspace_path: workspacePath(tmpdir, "REP-2"),
          workspace_exists: true,
        },
        {
          issue_identifier: "REP-1",
          claim_state: "queued",
          workspace_path: workspacePath(tmpdir, "REP-1"),
        },
      ],
    });

    const status = shapeEngineStatus("foreground");
    assert.deepEqual(
      status.engine.active_work.map((item) => item.issue_identifier),
      ["REP-2", "REP-1"],
    );
    assert.equal("selected_work" in status.queue, false);
    assert.equal("selected_issue_identifier" in status.queue.summary, false);
    assert.equal("selected_state" in status.queue.summary, false);
    assert.equal(fs.existsSync(stateDbPath()), true);

    const db = new DatabaseSync(stateDbPath(), { readOnly: true });
    try {
      const queueRow = db
        .prepare("select value from state where key = ?")
        .get("queue") as { value: string } | undefined;
      assert.ok(queueRow);
      assert.equal(JSON.parse(queueRow.value).items.length, 2);
    } finally {
      db.close();
    }

    const started = startEngine("foreground", true);
    assert.equal(started.engine.running, true);
    const stopped = stopEngine();
    assert.equal(stopped.engine.running, false);
  } finally {
    if (originalRepoRoot === undefined) {
      delete process.env.REPO_ROOT;
    } else {
      process.env.REPO_ROOT = originalRepoRoot;
    }
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("prepare-worktree sources repo-root scripts before claiming the item", () => {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(
    path.join(tmpRoot, "autobot-cli-prepare-worktree-"),
  );
  const repoRoot = path.resolve(process.cwd(), "../..");
  const fakePackageRoot = path.join(tmpdir, "packages", "autobot-cli");
  const originalCwd = process.cwd();
  const originalPath = process.env.PATH;
  fs.mkdirSync(path.join(fakePackageRoot, ".autobot"), { recursive: true });
  process.chdir(fakePackageRoot);
  const workspace = path.join(tmpdir, "workspaces", "rep-3");
  const fakeBinDir = path.join(tmpdir, "bin");
  const callsFile = path.join(tmpdir, "bash-calls.txt");
  fs.mkdirSync(fakeBinDir, { recursive: true });
  fs.writeFileSync(
    path.join(fakeBinDir, "bash"),
    `#!/bin/sh
printf '%s\n' "$*" >> "$AUTOBOT_PREPARE_CALLS"
mkdir -p "$AUTOBOT_PREPARE_WORKSPACE"
exit 0
`,
  );
  fs.chmodSync(path.join(fakeBinDir, "bash"), 0o755);
  process.env.PATH = `${fakeBinDir}${path.delimiter}${originalPath ?? ""}`;
  process.env.AUTOBOT_PREPARE_CALLS = callsFile;
  process.env.AUTOBOT_PREPARE_WORKSPACE = workspace;

  try {
    saveQueuePayload({
      items: [
        {
          issue_identifier: "REP-3",
          claim_state: "queued",
          workspace_path: workspace,
        },
      ],
    });

    runAutobotEngine(["node", "autobot-engine", "start", "--once"]);

    const calls = fs.readFileSync(callsFile, "utf8");
    assert.equal(calls.trim().length > 0, true);
    assert.equal(
      calls.includes(
        `source "${path.join(repoRoot, "scripts/lib/common.sh")}"`,
      ),
      true,
    );
    assert.equal(
      calls.includes(
        `source "${path.join(repoRoot, "scripts/lib/worktree.sh")}"`,
      ),
      true,
    );
    assert.equal(calls.includes('cmd_wt_create_from_issue "REP-3"'), true);
    assert.equal(fs.existsSync(workspace), true);

    const db = new DatabaseSync(stateDbPath(), { readOnly: true });
    try {
      const queueRow = db
        .prepare("select value from state where key = ?")
        .get("queue") as { value: string } | undefined;
      assert.ok(queueRow);
      const queue = JSON.parse(queueRow.value) as {
        items?: Array<{ claim_state?: string }>;
      };
      assert.equal(queue.items?.[0]?.claim_state, "preparing");
    } finally {
      db.close();
    }

    const writes: string[] = [];
    const write = test.mock.method(
      process.stdout,
      "write",
      (chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      },
    );
    try {
      runAutobot(["node", "autobot", "logs", "REP-3"]);
    } finally {
      write.mock.restore();
    }

    const logs = writes.join("").trim();
    assert.equal(logs.includes("task-success"), true);
    assert.equal(logs.includes("prepare-worktree"), true);
  } finally {
    process.chdir(originalCwd);
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    delete process.env.AUTOBOT_PREPARE_CALLS;
    delete process.env.AUTOBOT_PREPARE_WORKSPACE;
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("foreground engine start installs a heartbeat loop", () => {
  const interval = test.mock.method(
    globalThis,
    "setInterval",
    () => 1 as never,
  );
  const clear = test.mock.method(globalThis, "clearInterval", () => undefined);
  const stop = holdEngineLoop("foreground", 10);

  assert.equal(interval.mock.calls.length, 1);
  assert.equal(interval.mock.calls[0]?.arguments[1], 10);
  stop();
  assert.equal(clear.mock.calls.length, 1);
});

test("foreground engine heartbeat uses the configured tick frequency", () => {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, "autobot-cli-heartbeat-"));
  const repoDir = path.join(tmpdir, "repo");
  fs.mkdirSync(path.join(repoDir, ".autobot"), { recursive: true });
  const originalRepoRoot = process.env.REPO_ROOT;
  process.env.REPO_ROOT = repoDir;

  const interval = test.mock.method(
    globalThis,
    "setInterval",
    () => 1 as never,
  );
  const clear = test.mock.method(globalThis, "clearInterval", () => undefined);

  try {
    setConfigValue("engine.tick-frequency", "3");
    holdEngineLoop("foreground");

    assert.equal(interval.mock.calls.length, 1);
    assert.equal(interval.mock.calls[0]?.arguments[1], 3000);
  } finally {
    if (originalRepoRoot === undefined) {
      delete process.env.REPO_ROOT;
    } else {
      process.env.REPO_ROOT = originalRepoRoot;
    }
    interval.mock.restore();
    clear.mock.restore();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});

test("status defaults to human output and start emits a tick event", () => {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(
    path.join(tmpRoot, "autobot-cli-engine-output-"),
  );
  const repoDir = path.join(tmpdir, "repo");
  fs.mkdirSync(path.join(repoDir, ".autobot"), { recursive: true });
  const originalRepoRoot = process.env.REPO_ROOT;
  const originalJson = process.env.REPROCTL_JSON;
  const writes: string[] = [];
  const write = test.mock.method(
    process.stdout,
    "write",
    (chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    },
  );
  const interval = test.mock.method(
    globalThis,
    "setInterval",
    () => 1 as never,
  );
  process.env.REPO_ROOT = repoDir;

  saveQueuePayload({
    items: [
      {
        issue_identifier: "REP-2",
        claim_state: "developing",
        workspace_path: workspacePath(tmpdir, "REP-2"),
        workspace_exists: true,
      },
      {
        issue_identifier: "REP-1",
        claim_state: "queued",
        workspace_path: workspacePath(tmpdir, "REP-1"),
      },
    ],
  });

  try {
    runAutobotEngine(["node", "autobot-engine", "status"]);
    assert.equal(writes.join("").startsWith("ENGINE\n"), true);
    assert.equal(writes.join("").includes("active_work_count: 2"), true);
    assert.equal(writes.join("").includes("REP-2"), true);
    assert.equal(writes.join("").includes("REP-1"), true);
    assert.equal(writes.join("").includes('"schema_version"'), false);

    writes.length = 0;
    process.env.REPROCTL_JSON = "true";
    runAutobotEngine(["node", "autobot-engine", "status"]);
    assert.equal(writes.join("").includes('"schema_version"'), true);

    writes.length = 0;
    process.env.REPROCTL_JSON = "";
    runAutobotEngine(["node", "autobot-engine", "start"]);
    const lines = writes
      .join("")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

    assert.equal(interval.mock.calls.length >= 1, true);
    assert.equal(
      lines.some((line) => line.kind === "tick"),
      true,
    );
    assert.deepEqual(
      (
        (
          lines.find((line) => line.kind === "tick")?.engine as
            | {
                active_work?: Array<{ issue_identifier?: string }>;
              }
            | undefined
        )?.active_work ?? []
      ).map((item) => item.issue_identifier),
      ["REP-2", "REP-1"],
    );
    assert.deepEqual(lines.find((line) => line.kind === "tick")?.queue, {
      total: 2,
      claimed: 0,
      running: 2,
      reconciling: 0,
      recovery: 0,
      terminal: 0,
      by_state: {
        preparing: 1,
        testing: 1,
      },
      allow_recovery: true,
    });
    assert.equal(
      lines.some((line) => line.engine && line.schema_version),
      true,
    );
  } finally {
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
    write.mock.restore();
    interval.mock.restore();
    fs.rmSync(tmpdir, { recursive: true, force: true });
  }
});
