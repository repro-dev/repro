import assert from "node:assert/strict";
import test from "node:test";

import { fork, resolve, type FutureInstance } from "fluture";

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

function assertNonDecreasingTimestamps(timestamps: string[]): void {
  for (let index = 1; index < timestamps.length; index += 1) {
    const previous = timestamps[index - 1];
    const current = timestamps[index];

    assert.ok(
      current !== undefined && previous !== undefined && current >= previous,
      `expected timestamps to be non-decreasing at index ${index}`,
    );
  }
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
      "planning-failed",
      "developing",
      "testing",
      "reviewing",
      "review_fix",
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
  assert.deepEqual(blueprint.metadata?.cycleEntryPoints, ["developing"]);
  assert.deepEqual(
    blueprint.edges
      .map((edge) => [edge.source, edge.target, edge.action ?? null])
      .sort((left, right) => left.join("|").localeCompare(right.join("|"))),
    [
      ["claim", "preparing", null],
      ["preparing", "planning", null],
      ["planning", "planning-failed", null],
      ["planning", "developing", null],
      ["developing", "testing", null],
      ["testing", "reviewing", null],
      ["reviewing", "review_fix", null],
      ["review_fix", "review-loop", null],
      ["review-loop", "developing", null],
      ["review-loop", "reconcile", null],
      ["review-loop", "escalated", null],
      ["reconcile", "complete", null],
    ].sort((left, right) => left.join("|").localeCompare(right.join("|"))),
  );
  assert.deepEqual(workflow.blueprint, blueprint);
  assert.deepEqual(workflow.analysis.startNodeIds, ["claim"]);
  assert.deepEqual(workflow.analysis.terminalNodeIds, [
    "planning-failed",
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
    "planning-failed",
    "developing",
    "testing",
    "reviewing",
    "review_fix",
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
  assert.deepEqual(plan.metadata.planning_artifacts, []);
  assert.equal(plan.metadata.planning_session_result, null);
  assert.equal(plan.metadata.planning_run_plan_valid, false);
  assert.equal(plan.metadata.planning_run_plan_ready, false);
  assert.equal(plan.metadata.planning_should_fail, false);
  assert.equal(plan.metadata.planning_failure_reason, null);
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
      "review_fix",
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
  assert.equal(plan.flowcraft_events[0]?.occurred_at, plan.started_at);
  assert.equal(plan.flowcraft_events.at(-1)?.occurred_at, plan.finished_at);
  assertNonDecreasingTimestamps(
    plan.flowcraft_events.map((event) => event.occurred_at),
  );
  assertNonDecreasingTimestamps(
    plan.metadata.node_outputs.map((output) => output.occurred_at),
  );
  assertNonDecreasingTimestamps(
    plan.domain_events.map((event) => event.occurred_at),
  );
  assert.ok(
    new Set(plan.metadata.node_outputs.map((output) => output.occurred_at))
      .size > 1,
  );
  assert.ok(
    new Set(plan.domain_events.map((event) => event.occurred_at)).size > 1,
  );
  assert.equal(plan.domain_events.length, 8);
  assert.deepEqual(
    plan.domain_events.map((event) => event.state),
    [
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
  assert.equal(plan.domain_events[7]?.state, "completed");
  assert.equal(plan.domain_events[7]?.transport?.channel_id, "relay-channel");
  assert.equal(
    JSON.stringify(plan.flowcraft_events).includes('"transport"'),
    false,
  );
});

test("planning waits on non-ready run plans and records flowcraft evidence", async () => {
  const workflow = flowcraftWorkflows[0];
  const runtime = new FlowRuntime<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >({
    eventBus: { emit() {} },
    dependencies: {
      autobotPlanning: {
        repo: { path: "/worktrees/autobot", state_dir: ".autobot" },
        item: {
          issue_id: "REP-1154",
          title: "Ship FlowCraft workflow skeleton",
          url: "https://linear.app/repro/issue/REP-1154/ship-flowcraft-workflow-skeleton",
          state: "queued",
          attempt: 1,
          priority: 2,
          owner: "Gary",
          workspace: "autobot",
          branch: "autobot/REP-1154",
          queued_at: "2026-05-15T11:00:00Z",
          started_at: "2026-05-15T11:05:00Z",
          updated_at: "2026-05-15T11:05:00Z",
          last_event: null,
          last_error: null,
          recovery_commands: [],
          linear: null,
          current_run: null,
          cancellation_requested: false,
          cancellation_requested_at: null,
          artifacts: [],
          events: [],
        },
        artifactDrafts: [],
        artifactPaths: {
          context:
            "/worktrees/autobot/.autobot/runs/REP-1154/attempt-1/context.md",
          testPlan:
            "/worktrees/autobot/.autobot/runs/REP-1154/attempt-1/test-plan.md",
          contract:
            "/worktrees/autobot/.autobot/runs/REP-1154/attempt-1/contract.md",
          runPlan:
            "/worktrees/autobot/.autobot/runs/REP-1154/attempt-1/run-plan.md",
          prompt:
            "/worktrees/autobot/.autobot/runs/REP-1154/attempt-1/prompt.md",
        },
        artifactWriter: () => resolve(undefined),
        artifactReader: () =>
          resolve(
            [
              "## Readiness",
              "not_ready",
              "",
              "## Sequence Notes",
              "- return to research",
              "",
              "## Risk Notes",
              "- missing context",
              "",
              "## Plan",
              "- revisit scope",
            ].join("\n"),
          ),
        planningSessionRunner: () =>
          resolve({
            command: "opencode",
            args: ["run"],
            started_at: "2026-05-15T11:00:00Z",
            finished_at: "2026-05-15T11:00:01Z",
            exit_code: 0,
            signal: null,
            stdout: "planning stdout",
            stderr: "",
          }),
      },
    },
  });

  const result = await workflow.flow.run(runtime, {
    issue_id: "REP-1154",
    run_id: "run-1154",
    execution_id: "exec-1154",
    started_at: "2026-05-15T11:00:00Z",
    finished_at: "2026-05-15T11:00:02Z",
    review_attempts: 0,
    review_max_attempts: 3,
    review_requested: false,
    review_continue: false,
    review_should_reconcile: true,
    review_should_escalate: false,
    phase_history: [],
    transport: null,
  });

  const context = result.context as unknown as Record<string, unknown>;

  assert.equal(result.status, "awaiting");
  assert.equal(context["_outputs.planning"] !== undefined, true);
  assert.equal(
    (
      context["_outputs.planning"] as {
        planning_run_plan_ready?: boolean;
        planning_should_fail?: boolean;
      }
    )?.planning_run_plan_ready,
    false,
  );
  assert.equal(
    (
      context["_outputs.planning"] as {
        planning_run_plan_ready?: boolean;
        planning_should_fail?: boolean;
      }
    )?.planning_should_fail,
    false,
  );
});

test("explicit null planning session results stay null in execution metadata", async () => {
  const workflow = flowcraftWorkflows[0];
  const flow = workflow.flow as unknown as {
    blueprint: { nodes: Array<{ id: string; uses: string }> };
    functionRegistry: Map<string, unknown>;
  };
  const planningNode = flow.blueprint.nodes.find(
    (node) => node.id === "planning",
  );

  assert.ok(planningNode);

  const originalPlanningImplementation = flow.functionRegistry.get(
    planningNode.uses,
  );

  assert.ok(originalPlanningImplementation);

  flow.functionRegistry.set(
    planningNode.uses,
    async () =>
      ({
        output: {
          phase: "planning",
          state: "planning",
          planning_artifacts: [],
          planning_session_result: null,
          planning_run_plan_valid: false,
          planning_run_plan_ready: false,
          planning_should_fail: false,
          planning_failure_reason: null,
        },
      }) as never,
  );

  try {
    const plan = await runFuture<FlowcraftExecutionPlan>(
      buildFlowcraftExecutionPlan({
        issue_id: "REP-1154",
        run_id: "run-1154",
        execution_id: "exec-1154",
        started_at: "2026-05-15T11:00:00.000Z",
        finished_at: "2026-05-15T11:00:01.000Z",
        transport: null,
      }),
    );

    assert.equal(plan.metadata.planning_session_result, null);
  } finally {
    flow.functionRegistry.set(
      planningNode.uses,
      originalPlanningImplementation,
    );
  }
});

test("planning failures route through the failed terminal node", async () => {
  const workflow = flowcraftWorkflows[0];
  const runtime = new FlowRuntime<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >({
    eventBus: { emit() {} },
    dependencies: {
      autobotPlanning: {
        repo: { path: "/worktrees/autobot", state_dir: ".autobot" },
        item: {
          issue_id: "REP-1154",
          title: "Ship FlowCraft workflow skeleton",
          url: "https://linear.app/repro/issue/REP-1154/ship-flowcraft-workflow-skeleton",
          state: "queued",
          attempt: 1,
          priority: 2,
          owner: "Gary",
          workspace: "autobot",
          branch: "autobot/REP-1154",
          queued_at: "2026-05-15T11:00:00Z",
          started_at: "2026-05-15T11:05:00Z",
          updated_at: "2026-05-15T11:05:00Z",
          last_event: null,
          last_error: null,
          recovery_commands: [],
          linear: null,
          current_run: null,
          cancellation_requested: false,
          cancellation_requested_at: null,
          artifacts: [],
          events: [],
        },
        artifactDrafts: [],
        artifactPaths: {
          context:
            "/worktrees/autobot/.autobot/runs/REP-1154/attempt-1/context.md",
          testPlan:
            "/worktrees/autobot/.autobot/runs/REP-1154/attempt-1/test-plan.md",
          contract:
            "/worktrees/autobot/.autobot/runs/REP-1154/attempt-1/contract.md",
          runPlan:
            "/worktrees/autobot/.autobot/runs/REP-1154/attempt-1/run-plan.md",
          prompt:
            "/worktrees/autobot/.autobot/runs/REP-1154/attempt-1/prompt.md",
        },
        artifactWriter: () => resolve(undefined),
        artifactReader: () =>
          resolve(
            [
              "## Readiness",
              "ready_to_proceed",
              "",
              "## Sequence Notes",
              "",
              "## Risk Notes",
              "- missing context",
              "",
              "## Plan",
              "- revisit scope",
            ].join("\n"),
          ),
        planningSessionRunner: () =>
          resolve({
            command: "opencode",
            args: ["run"],
            started_at: "2026-05-15T11:00:00Z",
            finished_at: "2026-05-15T11:00:01Z",
            exit_code: 0,
            signal: null,
            stdout: "planning stdout",
            stderr: "",
          }),
      },
    },
  });

  const result = await workflow.flow.run(runtime, {
    issue_id: "REP-1154",
    run_id: "run-1154",
    execution_id: "exec-1154",
    started_at: "2026-05-15T11:00:00Z",
    finished_at: "2026-05-15T11:00:02Z",
    review_attempts: 0,
    review_max_attempts: 3,
    review_requested: false,
    review_continue: false,
    review_should_reconcile: true,
    review_should_escalate: false,
    phase_history: [],
    transport: null,
  });

  const context = result.context as unknown as Record<string, unknown>;

  assert.equal(result.status, "failed");
  assert.equal(context["_outputs.planning"] !== undefined, true);
  assert.equal(
    (
      context["_outputs.planning"] as {
        planning_should_fail?: boolean;
        planning_failure_reason?: string;
      }
    )?.planning_should_fail,
    true,
  );
  assert.match(
    (
      context["_outputs.planning-failed"] as {
        planning_failure_reason?: string;
      }
    )?.planning_failure_reason ?? "",
    /empty ## Sequence Notes/,
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
    review_attempts: 0,
    review_max_attempts: 1,
    review_requested: true,
    review_continue: false,
    review_should_reconcile: false,
    review_should_escalate: false,
    phase_history: [],
    transport: null,
  });

  const context = result.context as unknown as Record<string, unknown>;

  assert.equal(result.status, "completed");
  assert.equal(context["_outputs.review_fix"] !== undefined, true);
  assert.equal(
    (context["_outputs.review_fix"] as { review_should_escalate?: boolean })
      ?.review_should_escalate,
    true,
  );
  assert.equal(context["_outputs.escalated"] !== undefined, true);
  assert.equal(context["_outputs.complete"], undefined);
});
