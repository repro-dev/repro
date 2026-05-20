import assert from "node:assert/strict";
import test from "node:test";

import { fork, type FutureInstance } from "fluture";

import { FlowRuntime, generateMermaid } from "../flowcraft-runtime";
import type {
  FlowcraftWorkflowContext,
  FlowcraftWorkflowDependencies,
} from "../types";

import {
  buildFlowcraftExecutionPlan,
  getFlowcraftRecoveryCommands,
  mapFlowcraftStatusToItemState,
  type FlowcraftExecutionPlan,
  flowcraftWorkflows,
  listFlowcraftWorkflows,
  renderFlowcraftWorkflowDiagram,
  validateFlowcraftWorkflows,
} from "../index";

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    future.pipe(fork(reject)(resolve));
  });
}

test("autobot deliver issue workflow exposes explicit delivery phases and review loop metadata", () => {
  const workflow = flowcraftWorkflows[0];
  const blueprint = workflow.flow.toBlueprint();

  assert.equal(workflow.id, "autobot-deliver-issue");
  assert.deepEqual(
    blueprint.nodes.map((node) => node.id),
    [
      "claim",
      "preparing",
      "planning",
      "developing",
      "testing",
      "reviewing",
      "review-fix",
      "review-loop",
      "reconcile",
      "escalated",
      "complete",
    ],
  );
  assert.equal(
    blueprint.nodes.find((node) => node.id === "developing")?.config
      ?.maxRetries,
    2,
  );
  assert.match(
    blueprint.nodes.find((node) => node.id === "review-loop")?.params
      ?.condition as string,
    /^review_continue$/,
  );
  assert.deepEqual(blueprint.metadata?.cycleEntryPoints, ["developing"]);
  assert.deepEqual(
    blueprint.edges
      .map((edge) => [edge.source, edge.target, edge.action ?? null])
      .sort((left, right) => left.join("|").localeCompare(right.join("|"))),
    [
      ["claim", "preparing", null],
      ["preparing", "planning", null],
      ["planning", "developing", null],
      ["developing", "testing", null],
      ["testing", "reviewing", null],
      ["reviewing", "review-fix", null],
      ["review-fix", "review-loop", null],
      ["review-loop", "developing", "continue"],
      ["review-loop", "reconcile", "break"],
      ["review-loop", "escalated", "escalate"],
      ["reconcile", "complete", null],
    ].sort((left, right) => left.join("|").localeCompare(right.join("|"))),
  );
  assert.deepEqual(workflow.blueprint, blueprint);
  assert.deepEqual(workflow.analysis.startNodeIds, ["claim"]);
  assert.deepEqual(workflow.analysis.terminalNodeIds, [
    "escalated",
    "complete",
  ]);
  assert.equal(workflow.analysis.isDag, false);
  assert.equal(workflow.lint.isValid, true);
});

test("workflow validation and diagram output come from FlowCraft analysis", () => {
  const workflow = flowcraftWorkflows[0];
  const [validation] = validateFlowcraftWorkflows();

  assert.ok(validation);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);
  assert.deepEqual(validation.analysis, workflow.analysis);
  assert.deepEqual(validation.lint, workflow.lint);
  assert.equal(
    renderFlowcraftWorkflowDiagram(),
    generateMermaid(workflow.blueprint),
  );
  assert.deepEqual(listFlowcraftWorkflows()[0]?.node_ids, [
    "claim",
    "preparing",
    "planning",
    "developing",
    "testing",
    "reviewing",
    "review-fix",
    "review-loop",
    "reconcile",
    "escalated",
    "complete",
  ]);
});

test("flowcraft status mappings preserve terminal-state recovery semantics", () => {
  assert.equal(mapFlowcraftStatusToItemState("completed"), "completed");
  assert.equal(mapFlowcraftStatusToItemState("awaiting"), "awaiting");
  assert.equal(mapFlowcraftStatusToItemState("failed"), "failed");
  assert.equal(mapFlowcraftStatusToItemState("cancelled"), "canceled");
  assert.equal(mapFlowcraftStatusToItemState("stalled"), "failed");
  assert.deepEqual(getFlowcraftRecoveryCommands("failed", "REP-1154"), [
    "autobot-next logs REP-1154 --json",
  ]);
});

test("execution plans persist serialized context, loop metadata, and phase events", async () => {
  const plan = await runFuture<FlowcraftExecutionPlan>(
    buildFlowcraftExecutionPlan({
      issue_id: "REP-1154",
      run_id: "run-1154",
      execution_id: "exec-1154",
      started_at: "2026-05-15T11:00:00.000Z",
      finished_at: "2026-05-15T11:00:01.000Z",
      transport: {
        source: "relay",
        workspace_id: "relay-workspace",
        channel_id: "relay-channel",
        thread_id: "relay-thread",
        agent_id: "relay-agent",
        message_id: "relay-message",
      },
    }),
  );

  assert.equal(plan.workflow.id, "autobot-deliver-issue");
  assert.equal(plan.metadata.workflow_id, "autobot-deliver-issue");
  assert.equal(plan.metadata.workflow_status, "completed");
  assert.equal(plan.metadata.item_state, "completed");
  assert.equal(plan.metadata.loop.id, "review-loop");
  assert.equal(plan.metadata.loop.attempt_limit, 3);
  assert.equal(plan.metadata.loop.attempts, 1);
  assert.equal(plan.metadata.loop.continued, false);
  assert.equal(plan.metadata.loop.exhausted, false);
  assert.deepEqual(plan.metadata.phase_sequence, [
    "claim",
    "preparing",
    "planning",
    "developing",
    "testing",
    "reviewing",
    "review-fix",
    "reconcile",
    "complete",
  ]);
  assert.deepEqual(
    plan.metadata.node_outputs.map((output) => output.node_id),
    [
      "claim",
      "preparing",
      "planning",
      "developing",
      "testing",
      "reviewing",
      "review-fix",
      "review-loop",
      "reconcile",
      "complete",
    ],
  );
  assert.match(plan.metadata.serialized_context, /"issue_id":"REP-1154"/);
  assert.match(plan.metadata.serialized_context, /"_outputs\.complete"/);
  assert.ok(plan.flowcraft_events.length >= 10);
  assert.equal(plan.flowcraft_events[0]?.type, "workflow:start");
  assert.equal(plan.flowcraft_events.at(-1)?.type, "workflow:finish");
  assert.equal(plan.transport?.channel_id, "relay-channel");
  assert.deepEqual(plan.metadata.recovery_commands, []);
  assert.equal(
    plan.flowcraft_events.some((event) => event.node_id === "escalated"),
    false,
  );
  assert.equal(plan.domain_events.length, 9);
  assert.deepEqual(
    plan.domain_events.map((event) => event.state),
    [
      "claimed",
      "preparing",
      "planning",
      "developing",
      "testing",
      "reviewing",
      "reviewing",
      "reconciling",
      "completed",
    ],
  );
  assert.equal(plan.domain_events[8]?.state, "completed");
  assert.equal(plan.domain_events[8]?.transport?.channel_id, "relay-channel");
  assert.equal(
    JSON.stringify(plan.flowcraft_events).includes('"transport"'),
    false,
  );
});

test("deliberate escalation stays distinct from completion", async () => {
  const workflow = flowcraftWorkflows[0];
  const runtime = new FlowRuntime<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >({ eventBus: { emit() {} } });
  const result = await workflow.flow.run(runtime, {
    issue_id: "REP-1157",
    run_id: "run-1157",
    execution_id: "exec-1157",
    started_at: "2026-05-15T11:30:00.000Z",
    finished_at: "2026-05-15T11:30:01.000Z",
    review_attempts: 1,
    review_max_attempts: 1,
    review_requested: false,
    review_continue: false,
    review_should_reconcile: false,
    review_should_escalate: true,
    phase_history: [],
    transport: null,
  });

  const context = result.context as unknown as Record<string, unknown>;

  assert.equal(result.status, "completed");
  assert.equal(context["_outputs.escalated"] !== undefined, true);
  assert.equal(context["_outputs.complete"], undefined);
});
