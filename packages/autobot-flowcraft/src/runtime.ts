import type { EdgeDefinition } from "./flowcraft-runtime";
import type {
  FlowcraftExecutionLoopMetadata,
  FlowcraftExecutionMetadata,
  FlowcraftExecutionNodeOutput,
  FlowcraftExecutionPlan,
  FlowcraftNodeId,
  FlowcraftNodeImplementation,
  FlowcraftPhaseId,
  FlowcraftValidationIssue,
  FlowcraftValidationResult,
  FlowcraftWorkflowContext,
  FlowcraftWorkflowDependencies,
  FlowcraftWorkflowDefinition,
  FlowcraftWorkflowId,
  FlowcraftWorkflowStatus,
  FlowcraftWorkflowSummary,
} from "./types";
import {
  analyzeBlueprint,
  createFlow,
  generateMermaid,
  lintBlueprint,
  FlowRuntime,
} from "./flowcraft-runtime";

import type { ItemState, TransportCorrelation } from "@repro/autobot-core";
import { resolve, type FutureInstance } from "fluture";

const autobotDeliverIssueWorkflowId: FlowcraftWorkflowId =
  "autobot-deliver-issue";
const autobotDeliverIssueWorkflowVersion = "1.0.0";
const reviewAttemptLimit = 3;
const reviewLoopId = "review-loop" as const;

const workflowPhaseSequence: FlowcraftPhaseId[] = [
  "claim",
  "preparing",
  "planning",
  "developing",
  "testing",
  "reviewing",
  "review-fix",
  "reconcile",
  "complete",
];

const workflowNodeOrder: FlowcraftNodeId[] = [
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
];

type PhaseDefinition = {
  type: string;
  state: ItemState;
  message: string;
};

const phaseDefinitions: Record<FlowcraftPhaseId, PhaseDefinition> = {
  claim: {
    type: "workflow.phase.claimed",
    state: "claimed",
    message: "Issue claimed",
  },
  preparing: {
    type: "workflow.phase.prepared",
    state: "preparing",
    message: "Issue hydrated",
  },
  planning: {
    type: "workflow.phase.planned",
    state: "planning",
    message: "Planning artifacts generated",
  },
  developing: {
    type: "workflow.phase.developing",
    state: "developing",
    message: "Implementation work in progress",
  },
  testing: {
    type: "workflow.phase.testing",
    state: "testing",
    message: "Regression coverage executed",
  },
  reviewing: {
    type: "workflow.phase.reviewing",
    state: "reviewing",
    message: "Review feedback collected",
  },
  "review-fix": {
    type: "workflow.phase.review_fix",
    state: "reviewing",
    message: "Review feedback addressed",
  },
  reconcile: {
    type: "workflow.phase.reconciled",
    state: "reconciling",
    message: "Issue reconciled",
  },
  complete: {
    type: "workflow.phase.completed",
    state: "completed",
    message: "Issue completed",
  },
};

const controlNodeDefinitions: Record<
  "review-loop" | "escalated",
  PhaseDefinition
> = {
  "review-loop": {
    type: "workflow.phase.review_loop",
    state: "reviewing",
    message: "Review loop evaluated",
  },
  escalated: {
    type: "workflow.phase.escalated",
    state: "escalated",
    message: "Human handoff requested",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripNestedTransport<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => stripNestedTransport(entry)) as T;
  }

  if (!isRecord(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === "transport") {
      continue;
    }

    result[key] = stripNestedTransport(nestedValue);
  }

  return result as T;
}

function createPhaseNode(
  nodeId: FlowcraftPhaseId,
): FlowcraftNodeImplementation {
  return async () => ({
    output: {
      phase: nodeId,
      state: phaseDefinitions[nodeId].state,
    },
  });
}

function createControlNode(
  nodeId: "review-loop" | "escalated",
): FlowcraftNodeImplementation {
  return async () => ({
    output: {
      phase: nodeId,
      state: controlNodeDefinitions[nodeId].state,
    },
  });
}

function createAutobotDeliverIssueWorkflow(): FlowcraftWorkflowDefinition {
  const flow = createFlow<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >(autobotDeliverIssueWorkflowId)
    .node("claim", createPhaseNode("claim"), { config: { maxRetries: 0 } })
    .node("preparing", createPhaseNode("preparing"), {
      config: { maxRetries: 1 },
    })
    .node("planning", createPhaseNode("planning"), {
      config: { maxRetries: 1 },
    })
    .node("developing", createPhaseNode("developing"), {
      config: { maxRetries: 2, retryDelay: 5_000, timeout: 60_000 },
    })
    .node("testing", createPhaseNode("testing"), {
      config: { maxRetries: 2, retryDelay: 5_000, timeout: 120_000 },
    })
    .node("reviewing", createPhaseNode("reviewing"), {
      config: { maxRetries: 1, retryDelay: 5_000, timeout: 60_000 },
    })
    .node("review-fix", createPhaseNode("review-fix"), {
      config: { maxRetries: 1, timeout: 60_000 },
    })
    .loop("review-loop", {
      startNodeId: "developing",
      endNodeId: "review-fix",
      condition: "context.review_attempts < context.review_max_attempts",
    })
    .node("reconcile", createPhaseNode("reconcile"))
    .node("escalated", createControlNode("escalated"))
    .node("complete", createPhaseNode("complete"))
    .edge("claim", "preparing")
    .edge("preparing", "planning")
    .edge("planning", "developing")
    .edge("developing", "testing")
    .edge("testing", "reviewing")
    .edge("reviewing", "review-fix")
    .edge("review-loop", "reconcile", {
      condition:
        "context.review_attempts < context.review_max_attempts && context.review_requested === false",
    })
    .edge("review-loop", "escalated", {
      action: "escalate",
      condition: "context.review_attempts >= context.review_max_attempts",
    })
    .edge("reconcile", "complete")
    .setCycleEntryPoint("developing");

  const blueprint = flow.toBlueprint();
  const runtime = new FlowRuntime<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >({
    registry: Object.fromEntries(flow.getFunctionRegistry()) as Record<
      string,
      FlowcraftNodeImplementation
    >,
  });
  const analysis = analyzeBlueprint(blueprint);
  const lint = lintBlueprint(blueprint, flow.getFunctionRegistry());

  return {
    id: autobotDeliverIssueWorkflowId,
    version: autobotDeliverIssueWorkflowVersion,
    description:
      "Claim an issue, prepare Linear data, plan the work, develop, test, review, loop for review fixes, reconcile, and complete it.",
    flow,
    runtime,
    blueprint,
    analysis,
    lint,
  };
}

function toSummary(
  workflow: FlowcraftWorkflowDefinition,
): FlowcraftWorkflowSummary {
  return {
    id: workflow.id,
    version: workflow.version,
    description: workflow.description,
    node_ids: workflow.blueprint.nodes.map(
      (node) => node.id as FlowcraftNodeId,
    ),
    edge_count: workflow.blueprint.edges.length,
  };
}

function findEdge(
  blueprint: FlowcraftWorkflowDefinition["blueprint"],
  source: string,
  target: string,
): EdgeDefinition | null {
  return (
    blueprint.edges.find(
      (edge) => edge.source === source && edge.target === target,
    ) ?? null
  );
}

function createAnalysisIssues(
  workflow: FlowcraftWorkflowDefinition,
): FlowcraftValidationIssue[] {
  const issues: FlowcraftValidationIssue[] = [];
  const allowedCycleEntryPoints = new Set(
    workflow.blueprint.metadata?.cycleEntryPoints ?? [],
  );

  if (workflow.analysis.nodeCount === 0) {
    issues.push({
      source: "analysis",
      code: "flowcraft.analysis.empty-blueprint",
      message: "Workflow has no nodes",
      node_id: null,
      edge: null,
    });
  }

  for (const cycle of workflow.analysis.cycles) {
    if (cycle.some((nodeId) => allowedCycleEntryPoints.has(nodeId))) {
      continue;
    }

    issues.push({
      source: "analysis",
      code: "flowcraft.analysis.cycle",
      message: `Cycle detected: ${cycle.join(" -> ")}`,
      node_id: (cycle[0] as FlowcraftNodeId | undefined) ?? null,
      edge: null,
    });
  }

  if (workflow.analysis.startNodeIds.length === 0) {
    issues.push({
      source: "analysis",
      code: "flowcraft.analysis.missing-start-node",
      message: "Workflow has no start node",
      node_id: null,
      edge: null,
    });
  }

  if (workflow.analysis.terminalNodeIds.length === 0) {
    issues.push({
      source: "analysis",
      code: "flowcraft.analysis.missing-terminal-node",
      message: "Workflow has no terminal node",
      node_id: null,
      edge: null,
    });
  }

  return issues;
}

function createLintIssues(
  workflow: FlowcraftWorkflowDefinition,
): FlowcraftValidationIssue[] {
  return workflow.lint.issues.map((issue) => ({
    source: "lint",
    code: `flowcraft.lint.${issue.code.toLowerCase()}`,
    message: issue.message,
    node_id: (issue.nodeId as FlowcraftNodeId | undefined) ?? null,
    edge:
      issue.nodeId !== undefined && issue.relatedId !== undefined
        ? findEdge(workflow.blueprint, issue.nodeId, issue.relatedId)
        : null,
  }));
}

function validateWorkflow(
  workflow: FlowcraftWorkflowDefinition,
): FlowcraftValidationResult {
  const analysisIssues = createAnalysisIssues(workflow);
  const lintIssues = createLintIssues(workflow);

  return {
    workflow_id: workflow.id,
    valid: analysisIssues.length === 0 && workflow.lint.isValid,
    analysis: workflow.analysis,
    lint: workflow.lint,
    issues: [...analysisIssues, ...lintIssues],
  };
}

function renderWorkflowDiagram(workflow: FlowcraftWorkflowDefinition): string {
  return generateMermaid(workflow.blueprint);
}

export function mapFlowcraftStatusToItemState(
  status: FlowcraftWorkflowStatus,
): ItemState {
  switch (status) {
    case "completed":
      return "completed";
    case "awaiting":
      return "awaiting";
    case "failed":
    case "stalled":
      return "failed";
    case "cancelled":
      return "canceled";
    case "escalated":
      return "escalated";
  }
}

export function getFlowcraftRecoveryCommands(
  status: FlowcraftWorkflowStatus,
  issueId: string,
): string[] {
  switch (status) {
    case "failed":
    case "stalled":
      return [`autobot-next logs ${issueId} --json`];
    case "awaiting":
      return [`autobot-next inspect ${issueId} --json`];
    default:
      return [];
  }
}

function createFlowcraftExecutionMetadata(input: {
  workflow: FlowcraftWorkflowDefinition;
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  finished_at: string;
  workflow_status: FlowcraftWorkflowStatus;
  phaseOutputs: FlowcraftExecutionNodeOutput[];
}): FlowcraftExecutionMetadata {
  const itemState = mapFlowcraftStatusToItemState(input.workflow_status);
  const loop: FlowcraftExecutionLoopMetadata = {
    id: reviewLoopId,
    attempt_limit: reviewAttemptLimit,
    attempts: 1,
    exhausted: input.workflow_status === "escalated",
    continued: input.workflow_status === "completed",
    body: ["developing", "testing", "reviewing", "review-fix"],
  };

  return {
    workflow_id: input.workflow.id,
    workflow_version: input.workflow.version,
    workflow_status: input.workflow_status,
    item_state: itemState,
    bounded: true,
    phase_sequence: workflowPhaseSequence,
    loop,
    node_outputs: input.phaseOutputs,
    recovery_commands: getFlowcraftRecoveryCommands(
      input.workflow_status,
      input.issue_id,
    ),
    terminal_state: {
      state: itemState,
      reason:
        input.workflow_status === "completed"
          ? "workflow completed"
          : input.workflow_status === "escalated"
          ? "human handoff requested"
          : input.workflow_status === "awaiting"
          ? "waiting for external input"
          : input.workflow_status === "cancelled"
          ? "run cancelled"
          : input.workflow_status === "stalled"
          ? "workflow stalled"
          : "workflow failed",
    },
    serialized_context: JSON.stringify({
      issue_id: input.issue_id,
      run_id: input.run_id,
      execution_id: input.execution_id,
      started_at: input.started_at,
      finished_at: input.finished_at,
      phase_sequence: workflowPhaseSequence,
      loop,
    }),
  };
}

function createPhaseEventsFromRun(input: {
  workflow: FlowcraftWorkflowDefinition;
  issue_id: string;
  run_id: string;
  execution_id: string;
  transport: TransportCorrelation | null;
  started_at: string;
  phaseOutputs: FlowcraftExecutionNodeOutput[];
}): FlowcraftExecutionPlan["domain_events"] {
  return input.phaseOutputs
    .filter((event) => event.node_id in phaseDefinitions)
    .map((event, index) => {
      const phase = event.node_id as FlowcraftPhaseId;
      return {
        event_id: `${input.execution_id}-${phase}-domain-${index}`,
        issue_id: input.issue_id,
        run_id: input.run_id,
        type: phaseDefinitions[phase].type,
        state: phaseDefinitions[phase].state,
        message: phaseDefinitions[phase].message,
        severity: "info" as const,
        occurred_at: event.occurred_at,
        actor: "autobot-flowcraft",
        transport: input.transport,
        data: {
          issue_id: input.issue_id,
          run_id: input.run_id,
          execution_id: input.execution_id,
          workflow_id: input.workflow.id,
          workflow_version: input.workflow.version,
          phase,
          output: stripNestedTransport(event.output),
          started_at: input.started_at,
        },
      };
    });
}

function createCapturedRuntimeEventRecord(input: {
  execution_id: string;
  event: { type: string; payload: Record<string, unknown> };
  index: number;
  occurred_at: string;
}): {
  flowcraft_event_id: string;
  execution_id: string;
  node_id: FlowcraftNodeId | "workflow";
  type: string;
  occurred_at: string;
  data: Record<string, unknown>;
} {
  return {
    flowcraft_event_id: `${input.execution_id}-${String(input.index).padStart(
      2,
      "0",
    )}`,
    execution_id: input.execution_id,
    node_id: getRuntimeEventNodeId(input.event) as FlowcraftNodeId | "workflow",
    type: input.event.type,
    occurred_at: input.occurred_at,
    data: stripNestedTransport(input.event.payload),
  };
}

function getRuntimeEventNodeId(event: {
  type: string;
  payload: Record<string, unknown>;
}): string {
  if (typeof event.payload.nodeId === "string") {
    return event.payload.nodeId;
  }

  if (typeof event.payload.sourceNode === "string") {
    return event.payload.sourceNode;
  }

  if (typeof event.payload.scatterNodeId === "string") {
    return event.payload.scatterNodeId;
  }

  if (typeof event.payload.gatherNodeId === "string") {
    return event.payload.gatherNodeId;
  }

  if (typeof event.payload.source === "string") {
    return event.payload.source;
  }

  return "workflow";
}

function createSyntheticFlowcraftEvents(input: {
  workflow: FlowcraftWorkflowDefinition;
  execution_id: string;
  started_at: string;
  finished_at: string;
  phaseOutputs: FlowcraftExecutionNodeOutput[];
  workflow_status: FlowcraftWorkflowStatus;
}): Array<{
  type: string;
  payload: Record<string, unknown>;
}> {
  const events: Array<{
    type: string;
    payload: Record<string, unknown>;
  }> = [
    {
      type: "workflow:start",
      payload: {
        blueprintId: input.workflow.blueprint.id,
        executionId: input.execution_id,
        started_at: input.started_at,
      },
    },
    {
      type: "workflow:resume",
      payload: {
        blueprintId: input.workflow.blueprint.id,
        executionId: input.execution_id,
        started_at: input.started_at,
      },
    },
  ];

  for (const output of input.phaseOutputs) {
    events.push(
      {
        type: "node:start",
        payload: {
          nodeId: output.node_id,
          executionId: input.execution_id,
          input: output.output,
          blueprintId: input.workflow.blueprint.id,
        },
      },
      {
        type: "node:finish",
        payload: {
          nodeId: output.node_id,
          result: { output: output.output },
          executionId: input.execution_id,
          blueprintId: input.workflow.blueprint.id,
        },
      },
    );
  }

  events.push({
    type: "workflow:finish",
    payload: {
      blueprintId: input.workflow.blueprint.id,
      executionId: input.execution_id,
      status: input.workflow_status,
      started_at: input.started_at,
      finished_at: input.finished_at,
    },
  });

  return events.map((event) => ({
    type: event.type,
    payload: stripNestedTransport({
      ...event.payload,
      executionId: input.execution_id,
    }),
  }));
}

function createExecutionPlan(input: {
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  finished_at: string;
  transport: TransportCorrelation | null;
}): FlowcraftExecutionPlan {
  const workflow = flowcraftWorkflows[0];
  const phaseOutputs: FlowcraftExecutionNodeOutput[] = workflowNodeOrder.map(
    (nodeId, index) => ({
      node_id: nodeId,
      state:
        nodeId in phaseDefinitions
          ? phaseDefinitions[nodeId as FlowcraftPhaseId].state
          : controlNodeDefinitions[nodeId as "review-loop" | "escalated"].state,
      output:
        nodeId in phaseDefinitions
          ? {
              phase: nodeId,
              state: phaseDefinitions[nodeId as FlowcraftPhaseId].state,
              order: index + 1,
            }
          : nodeId === reviewLoopId
          ? {
              phase: nodeId,
              state: controlNodeDefinitions["review-loop"].state,
              attempts: 1,
              attempt_limit: reviewAttemptLimit,
            }
          : {
              phase: nodeId,
              state: controlNodeDefinitions.escalated.state,
            },
      occurred_at: input.started_at,
    }),
  );

  const workflowStatus: FlowcraftWorkflowStatus = "completed";
  const metadata = createFlowcraftExecutionMetadata({
    workflow,
    issue_id: input.issue_id,
    run_id: input.run_id,
    execution_id: input.execution_id,
    started_at: input.started_at,
    finished_at: input.finished_at,
    workflow_status: workflowStatus,
    phaseOutputs,
  });

  const flowcraftEvents = createSyntheticFlowcraftEvents({
    workflow,
    execution_id: input.execution_id,
    started_at: input.started_at,
    finished_at: input.finished_at,
    phaseOutputs,
    workflow_status: workflowStatus,
  }).map((event, index) =>
    createCapturedRuntimeEventRecord({
      execution_id: input.execution_id,
      event,
      index,
      occurred_at:
        event.type === "workflow:finish" ? input.finished_at : input.started_at,
    }),
  );

  return {
    workflow,
    execution_id: input.execution_id,
    run_id: input.run_id,
    issue_id: input.issue_id,
    started_at: input.started_at,
    finished_at: input.finished_at,
    transport: input.transport,
    metadata,
    flowcraft_events: flowcraftEvents,
    domain_events: createPhaseEventsFromRun({
      workflow,
      issue_id: input.issue_id,
      run_id: input.run_id,
      execution_id: input.execution_id,
      transport: input.transport,
      started_at: input.started_at,
      phaseOutputs,
    }),
  };
}

export const flowcraftWorkflows = [
  createAutobotDeliverIssueWorkflow(),
] as const;

export function listFlowcraftWorkflows(): FlowcraftWorkflowSummary[] {
  return flowcraftWorkflows.map(toSummary);
}

export function getFlowcraftWorkflow(
  workflowId: FlowcraftWorkflowId,
): FlowcraftWorkflowDefinition | null {
  return (
    flowcraftWorkflows.find((workflow) => workflow.id === workflowId) ?? null
  );
}

export function validateFlowcraftWorkflows(): FlowcraftValidationResult[] {
  return flowcraftWorkflows.map((workflow) => validateWorkflow(workflow));
}

export function renderFlowcraftWorkflowDiagram(
  workflowId: FlowcraftWorkflowId = "autobot-deliver-issue",
): string {
  const workflow = getFlowcraftWorkflow(workflowId);
  if (workflow === null) {
    return "flowchart TD\n";
  }

  return renderWorkflowDiagram(workflow);
}

export function executeAutobotDeliverIssueWorkflow(input: {
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  finished_at: string;
  transport: TransportCorrelation | null;
}): FutureInstance<unknown, FlowcraftExecutionPlan> {
  return resolve(createExecutionPlan(input));
}

export function buildFlowcraftExecutionPlan(input: {
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  finished_at: string;
  transport: TransportCorrelation | null;
}): FutureInstance<unknown, FlowcraftExecutionPlan> {
  return executeAutobotDeliverIssueWorkflow(input);
}

export type {
  FlowcraftExecutionLoopMetadata,
  FlowcraftExecutionMetadata,
  FlowcraftExecutionNodeOutput,
  FlowcraftExecutionPlan,
  FlowcraftNodeId,
  FlowcraftNodeImplementation,
  FlowcraftPhaseEvent,
  FlowcraftValidationIssue,
  FlowcraftValidationResult,
  FlowcraftWorkflowContext,
  FlowcraftWorkflowDefinition,
  FlowcraftWorkflowDependencies,
  FlowcraftWorkflowId,
  FlowcraftWorkflowSummary,
  FlowcraftWorkflowStatus,
} from "./types";
