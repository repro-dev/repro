import assert from "node:assert/strict";
import test from "node:test";

import { selectWork } from "../index";

test("selectWork preserves queued-before-recovery behavior", () => {
  const result = selectWork({
    items: [
      { issue_identifier: "REP-1", claim_state: "failed" },
      { issue_identifier: "REP-2", claim_state: "queued" },
      { issue_identifier: "REP-3", claim_state: "running" },
    ],
  });

  assert.equal(result.selected?.issue_identifier, "REP-2");
  assert.equal(result.summary.selected_state, "queued");
  assert.equal(result.summary.recovery, 1);
});
