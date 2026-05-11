import assert from "node:assert/strict";
import test from "node:test";

import { shapeStatus } from "../runtime";

test("status shaping hides terminal items while preserving summary", () => {
  const status = shapeStatus({
    items: [
      { issue_identifier: "REP-1", claim_state: "queued" },
      { issue_identifier: "REP-2", claim_state: "released" },
      { issue_identifier: "REP-3", claim_state: "running" },
    ],
  });

  assert.deepEqual(
    status.items.map((item) => item.issue_identifier),
    ["REP-1", "REP-3"],
  );
  assert.equal(status.summary.total, 3);
  assert.equal(status.summary.running, 1);
  assert.equal(status.summary.released, 1);
});
