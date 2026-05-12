import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  holdEngineLoop,
  saveQueuePayload,
  shapeEngineStatus,
  startEngine,
  stopEngine,
} from "../runtime";

test("engine status uses the same selected work as queue planning", () => {
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
          claim_state: "running",
          workspace_path: "/work/rep-2",
        },
        {
          issue_identifier: "REP-1",
          claim_state: "queued",
          workspace_path: "/work/rep-1",
        },
      ],
    });

    const status = shapeEngineStatus("foreground");
    assert.equal(status.queue.selected_work?.issue_identifier, "REP-1");
    assert.equal(status.engine.current_issue, "REP-1");

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

test("foreground engine start installs a heartbeat loop", () => {
  const interval = test.mock.method(
    globalThis,
    "setInterval",
    () => 1 as never,
  );
  const clear = test.mock.method(globalThis, "clearInterval", () => undefined);
  const stop = holdEngineLoop("foreground", 10);

  assert.equal(interval.mock.calls.length, 1);
  stop();
  assert.equal(clear.mock.calls.length, 1);
});
