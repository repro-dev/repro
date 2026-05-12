import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { saveQueuePayload } from "../runtime";
import { runAutobot } from "../commands/autobot";

function makeRepoRoot(): { repoDir: string; restore: () => void } {
  const mainCheckout = path.resolve(process.cwd(), "../..");
  const tmpRoot = path.join(mainCheckout, "tmp");
  fs.mkdirSync(tmpRoot, { recursive: true });
  const tmpdir = fs.mkdtempSync(path.join(tmpRoot, "autobot-cli-discover-"));
  const repoDir = path.join(tmpdir, "repo");
  fs.mkdirSync(path.join(repoDir, ".autobot"), { recursive: true });
  const originalRepoRoot = process.env.REPO_ROOT;
  process.env.REPO_ROOT = repoDir;

  return {
    repoDir,
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

test("discover shows issue metadata by default and ids in quiet mode", () => {
  const { restore } = makeRepoRoot();
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
        linear: {
          issue: {
            title: "Migrate autobot CLI",
            priority: 1,
            assignee: { name: "Ada Lovelace" },
            labels: [{ name: "Tech Debt" }],
          },
        },
      },
    ],
  });

  try {
    runAutobot(["node", "autobot", "discover"]);
    assert.equal(writes.join("").includes("Migrate autobot CLI"), true);
    assert.equal(writes.join("").includes("Ada Lovelace"), true);
    assert.equal(writes.join("").includes("Tech Debt"), true);
    assert.equal(writes.join("").includes("REP-1"), true);

    writes.length = 0;
    runAutobot(["node", "autobot", "discover", "-q"]);
    assert.equal(writes.join("").trim(), "REP-1");
  } finally {
    write.mock.restore();
    restore();
  }
});
