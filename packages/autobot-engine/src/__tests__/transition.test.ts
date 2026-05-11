import assert from "node:assert/strict";
import test from "node:test";

import { decideRecovery, transition } from "../index";

test("transition prepares queued work before delivery", () => {
  const decision = transition(
    {
      issue_identifier: "REP-1",
      claim_state: "queued",
      workspace_path: "/work/rep-1",
      attempt_count: 0,
    },
    {
      workspaceExists: true,
      workspaceDirty: false,
      mergeConflictCount: 0,
      linearStateType: "",
      linearStateName: "",
      prState: "",
      mergeStateStatus: "",
      reviewDecision: "",
      statusState: "",
      attemptCount: 0,
      maxAttempts: 3,
      claimState: "queued",
    },
  );

  assert.equal(decision.currentState, "queued");
  assert.equal(decision.nextState, "claimed");
  assert.equal(decision.effects[0]?.kind, "prepare");
});

test("transition routes claimed work into delivery processing", () => {
  const decision = transition(
    {
      issue_identifier: "REP-2",
      claim_state: "claimed",
      workspace_path: "/work/rep-2",
      attempt_count: 1,
    },
    {
      workspaceExists: true,
      workspaceDirty: false,
      mergeConflictCount: 0,
      linearStateType: "",
      linearStateName: "",
      prState: "",
      mergeStateStatus: "",
      reviewDecision: "",
      statusState: "",
      attemptCount: 1,
      maxAttempts: 3,
      claimState: "claimed",
    },
  );

  assert.equal(decision.nextState, "running");
  assert.equal(decision.effects[0]?.kind, "process-work");
});

test("decideRecovery preserves current recovery policy", () => {
  const release = decideRecovery({
    issue_identifier: "REP-3",
    claim_state: "running",
    attempt_count: 1,
    max_attempts: 3,
    workspace_exists: true,
    linear: { item: { status: { type: "done" } } },
  } as never);

  const retry = decideRecovery({
    issue_identifier: "REP-4",
    claim_state: "failed",
    attempt_count: 1,
    max_attempts: 3,
    workspace_exists: false,
  } as never);

  assert.equal(release.action, "release");
  assert.equal(retry.action, "retry");
});

test("terminal states become explicit no-ops", () => {
  const decision = transition(
    {
      issue_identifier: "REP-5",
      claim_state: "released",
    },
    {
      workspaceExists: false,
      workspaceDirty: false,
      mergeConflictCount: 0,
      linearStateType: "",
      linearStateName: "",
      prState: "",
      mergeStateStatus: "",
      reviewDecision: "",
      statusState: "",
      attemptCount: 0,
      maxAttempts: 0,
      claimState: "released",
    },
  );

  assert.equal(decision.nextState, "released");
  assert.equal(decision.effects[0]?.kind, "noop");
});
