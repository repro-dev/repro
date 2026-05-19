import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  getSingleTrackPhaseContractPath,
  listSingleTrackPhaseContractNames,
  loadSingleTrackPhaseContract,
} from "../phase-contracts";

test("single-track phase contracts are tracked markdown files", () => {
  const repoPath = path.resolve(process.cwd(), "..", "..");

  for (const name of listSingleTrackPhaseContractNames()) {
    const contractPath = getSingleTrackPhaseContractPath(repoPath, name);

    assert.match(
      contractPath,
      /packages\/autobot-cli\/contracts\/autobot-single-track\/.*\.md$/,
    );
    assert.doesNotThrow(() => readFileSync(contractPath, "utf8"));
  }
});

test("planning contract preserves the required headings and avoids deliver-wave language", () => {
  const content = loadSingleTrackPhaseContract("plan");

  for (const heading of [
    "## Readiness",
    "## Sequence Notes",
    "## Risk Notes",
    "## Plan",
  ]) {
    assert.match(
      content,
      new RegExp(`^${heading.replace(/[#]/g, "\\$&")}$`, "m"),
    );
  }

  assert.match(content, /## Open Questions/m);
  assert.doesNotMatch(content, /\bwave\b/i);
  assert.doesNotMatch(content, /\bbatch\b/i);
  assert.doesNotMatch(content, /sibling-issue/i);
  assert.doesNotMatch(content, /resequenc/i);
  assert.doesNotMatch(content, /\/deliver/i);
});
