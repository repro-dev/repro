import assert from "node:assert/strict";
import test from "node:test";

import { processQueue, trackedTasks } from "../core";

test("tracked tasks iterate deterministically by state and issue id", () => {
  const tasks = trackedTasks({
    items: [
      { issue_identifier: "REP-3", claim_state: "running" },
      { issue_identifier: "REP-1", claim_state: "claimed" },
      { issue_identifier: "REP-2", claim_state: "queued" },
      { issue_identifier: "REP-4", claim_state: "claimed" },
    ],
  });

  assert.deepEqual(
    tasks.map((task) => task.issue_identifier),
    ["REP-2", "REP-1", "REP-4", "REP-3"],
  );
});

test("processQueue returns ordered plans with effect requests", () => {
  const plan = processQueue({
    items: [
      {
        issue_identifier: "REP-2",
        claim_state: "claimed",
        workspace_path: "/work/rep-2",
        attempt_count: 1,
      },
      {
        issue_identifier: "REP-1",
        claim_state: "queued",
        workspace_path: "/work/rep-1",
        attempt_count: 0,
      },
    ],
  });

  assert.deepEqual(
    plan.items.map((entry) => entry.item.issue_identifier),
    ["REP-1", "REP-2"],
  );
  assert.equal(plan.items[0]?.decision.effects[0]?.kind, "prepare");
  assert.equal(plan.items[1]?.decision.effects[0]?.kind, "process-work");
});
