import assert from "node:assert/strict";
import test from "node:test";

import {
  type ItemState,
  getCancellationTransition,
  getFailureTransition,
  getForwardTransition,
  getRetryTransition,
  isImmediateCancellationState,
  isInProgressState,
  isTerminalState,
} from "./index";

test("forward transitions advance through the public lifecycle", () => {
  const steps: Array<[ItemState, ItemState]> = [
    ["queued", "claimed"],
    ["claimed", "preparing"],
    ["preparing", "planning"],
    ["planning", "developing"],
    ["developing", "testing"],
    ["testing", "reviewing"],
    ["reviewing", "reconciling"],
    ["reconciling", "completed"],
  ];

  for (const [from, to] of steps) {
    assert.equal(getForwardTransition(from), to);
  }

  assert.equal(getForwardTransition("completed"), null);
  assert.equal(getForwardTransition("canceled"), null);
  assert.equal(getForwardTransition("escalated"), null);
});

test("failure transitions only allow in-progress states to fail", () => {
  const inProgressStates = [
    "claimed",
    "preparing",
    "planning",
    "developing",
    "testing",
    "reviewing",
    "reconciling",
  ] as const;

  for (const state of inProgressStates) {
    assert.equal(getFailureTransition(state), "failed");
    assert.equal(isInProgressState(state), true);
  }

  assert.equal(getFailureTransition("queued"), null);
  assert.equal(getFailureTransition("awaiting"), null);
  assert.equal(getFailureTransition("completed"), null);
  assert.equal(getFailureTransition("canceled"), null);
  assert.equal(getFailureTransition("escalated"), null);
});

test("retry is only allowed from failed and never requeues terminals", () => {
  assert.equal(getRetryTransition("failed"), "queued");

  for (const state of [
    "queued",
    "claimed",
    "preparing",
    "planning",
    "developing",
    "testing",
    "reviewing",
    "reconciling",
    "awaiting",
    "escalated",
    "completed",
    "canceled",
  ] as const) {
    assert.equal(getRetryTransition(state), null);
  }
});

test("cancellation is immediate for queued, failed, and awaiting states", () => {
  for (const state of ["queued", "failed", "awaiting"] as const) {
    const transition = getCancellationTransition(state);

    assert.equal(transition.kind, "canceled");
    assert.equal(transition.to, "canceled");
    assert.equal(transition.cancellation_requested, false);
    assert.equal(isImmediateCancellationState(state), true);
  }
});

test("cancellation is requested for in-progress states and rejected for terminals", () => {
  const transition = getCancellationTransition("developing");

  assert.equal(transition.kind, "cancellation-requested");
  assert.equal(transition.to, "developing");
  assert.equal(transition.cancellation_requested, true);
  assert.equal(isTerminalState("developing"), false);

  const completed = getCancellationTransition("completed");
  const canceled = getCancellationTransition("canceled");
  const escalated = getCancellationTransition("escalated");

  assert.equal(completed.kind, "rejected");
  assert.equal(canceled.kind, "rejected");
  assert.equal(escalated.kind, "rejected");
  assert.equal(isTerminalState("escalated"), true);
  assert.equal(isImmediateCancellationState("escalated"), false);
});
