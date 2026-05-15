import assert from "node:assert/strict";
import test from "node:test";

import { fork, type FutureInstance } from "fluture";

import { generateMermaid } from "flowcraft";

import {
  buildFlowcraftExecutionPlan,
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

test("autobot deliver issue workflow is FlowCraft-backed with stable phase ids", () => {
  const workflow = flowcraftWorkflows[0];
  const blueprint = workflow.flow.toBlueprint();

  assert.equal(workflow.id, "autobot-deliver-issue");
  assert.deepEqual(
    blueprint.nodes.map((node) => node.id),
    ["claim", "reconcile", "complete"],
  );
  assert.deepEqual(workflow.blueprint, blueprint);
  assert.deepEqual(workflow.analysis.startNodeIds, ["claim"]);
  assert.deepEqual(workflow.analysis.terminalNodeIds, ["complete"]);
  assert.equal(workflow.analysis.isDag, true);
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
    "reconcile",
    "complete",
  ]);
});

test("execution plans project the skeleton phases into events", async () => {
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
  assert.ok(plan.flowcraft_events.length >= 8);
  assert.equal(plan.flowcraft_events[0]?.type, "workflow:start");
  assert.equal(plan.flowcraft_events.at(-1)?.type, "workflow:finish");
  assert.equal(plan.metadata.transport, undefined);
  assert.equal(plan.domain_events.length, 3);
  assert.equal(plan.domain_events[2]?.state, "completed");
  assert.equal(plan.domain_events[2]?.transport?.channel_id, "relay-channel");
  assert.equal(
    JSON.stringify(plan.flowcraft_events).includes('"transport"'),
    false,
  );
});
