import assert from "node:assert/strict";
import test from "node:test";

import { processQueue } from "../core";

test("recovery decisions retain visible action metadata", () => {
  const plan = processQueue({
    items: [
      {
        issue_identifier: "REP-9",
        claim_state: "failed",
        attempt_count: 1,
        max_attempts: 3,
        workspace_exists: false,
      },
    ],
  });

  const effect = plan.items[0]?.decision.effects[0];
  assert.equal(effect?.kind, "recover");
  assert.equal(
    effect && "action" in effect ? effect.action : undefined,
    "retry",
  );
  assert.equal(
    effect && "reason" in effect ? effect.reason : undefined,
    "missing-workspace",
  );
});
