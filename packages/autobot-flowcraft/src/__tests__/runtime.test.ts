import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFlowcraftExecutionPlan,
  flowcraftWorkflows,
  listFlowcraftWorkflows,
  renderFlowcraftWorkflowDiagram,
  validateFlowcraftWorkflows,
} from "../index";

test("autobot deliver issue workflow keeps stable phase ids", () => {
  const workflow = flowcraftWorkflows[0];

  assert.equal(workflow.id, "autobot-deliver-issue");
  assert.deepEqual(
    workflow.nodes.map((node) => node.id),
    ["claim", "reconcile", "complete"],
  );
  assert.equal(workflow.edges.length, 2);
});

test("workflow validation and diagram output are deterministic", () => {
  const [validation] = validateFlowcraftWorkflows();

  assert.ok(validation);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);
  assert.match(renderFlowcraftWorkflowDiagram(), /flowchart TD/);
  assert.match(renderFlowcraftWorkflowDiagram(), /claim/);
  assert.match(renderFlowcraftWorkflowDiagram(), /reconcile/);
  assert.match(renderFlowcraftWorkflowDiagram(), /complete/);
  assert.deepEqual(listFlowcraftWorkflows()[0]?.node_ids, [
    "claim",
    "reconcile",
    "complete",
  ]);
});

test("execution plans project the skeleton phases into events", () => {
  const plan = buildFlowcraftExecutionPlan({
    issue_id: "REP-1154",
    run_id: "run-1154",
    execution_id: "exec-1154",
    started_at: "2026-05-15T11:00:00.000Z",
    finished_at: "2026-05-15T11:00:01.000Z",
    transport: {
      workspace_id: "relay-workspace",
      channel_id: "relay-channel",
      thread_id: "relay-thread",
      agent_id: "relay-agent",
      message_id: "relay-message",
    },
  });

  assert.equal(plan.workflow.id, "autobot-deliver-issue");
  assert.equal(plan.flowcraft_events.length, 8);
  assert.equal(plan.domain_events.length, 3);
  assert.equal(plan.domain_events[2]?.state, "completed");
  assert.equal(plan.domain_events[2]?.transport?.channel_id, "relay-channel");
});
