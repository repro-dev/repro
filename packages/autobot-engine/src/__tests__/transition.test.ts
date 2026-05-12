import assert from "node:assert/strict";
import test from "node:test";

import { decideRecovery, transition } from "../index";

test("transition claims queued work and starts preparation", () => {
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
  assert.equal(decision.nextState, "preparing");
  assert.deepEqual(
    decision.effects.map((effect) => effect.kind),
    ["claim", "prepare-worktree"],
  );
});

test("transition keeps claimed work in the setup layer", () => {
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

  assert.equal(decision.nextState, "preparing");
  assert.equal(decision.effects[0]?.kind, "prepare-worktree");
});

test("transition advances setup work into planning", () => {
  const decision = transition(
    {
      issue_identifier: "REP-2",
      claim_state: "preparing",
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
      claimState: "preparing",
    },
  );

  assert.equal(decision.nextState, "planning");
  assert.equal(decision.effects[0]?.kind, "prepare-context");
});

test("decideRecovery preserves current recovery policy", () => {
  const release = decideRecovery({
    issue_identifier: "REP-3",
    claim_state: "developing",
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
