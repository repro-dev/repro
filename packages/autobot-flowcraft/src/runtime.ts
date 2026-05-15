import type { TransportCorrelation } from "@repro/autobot-core";

import type {
  FlowcraftEdgeDefinition,
  FlowcraftExecutionPlan,
  FlowcraftNodeDefinition,
  FlowcraftNodeId,
  FlowcraftPhaseEvent,
  FlowcraftValidationIssue,
  FlowcraftValidationResult,
  FlowcraftWorkflowDefinition,
  FlowcraftWorkflowId,
  FlowcraftWorkflowSummary,
} from "./types";

function createAutobotDeliverIssueWorkflow(): FlowcraftWorkflowDefinition {
  return {
    id: "autobot-deliver-issue",
    version: "1.0.0",
    description:
      "Claim an issue, reconcile the local and remote state, then complete the delivery skeleton.",
    nodes: [
      {
        id: "claim",
        title: "Claim",
        description: "Mark the issue as claimed and begin the delivery run.",
        kind: "task",
      },
      {
        id: "reconcile",
        title: "Reconcile",
        description: "Align local state, remote state, and delivery intent.",
        kind: "task",
      },
      {
        id: "complete",
        title: "Complete",
        description: "Finish the bounded skeleton run.",
        kind: "terminal",
      },
    ],
    edges: [
      { from: "claim", to: "reconcile" },
      { from: "reconcile", to: "complete" },
    ],
  };
}

// REP-1154 keeps FlowCraft as the local greenfield runtime skeleton here:
// workflow definitions are the authoritative builder/runtime/analyzer source.
export const flowcraftWorkflows = [
  createAutobotDeliverIssueWorkflow(),
] as const;

function toSummary(
  workflow: FlowcraftWorkflowDefinition,
): FlowcraftWorkflowSummary {
  return {
    id: workflow.id,
    version: workflow.version,
    description: workflow.description,
    node_ids: workflow.nodes.map((node) => node.id),
    edge_count: workflow.edges.length,
  };
}

function validateWorkflow(
  workflow: FlowcraftWorkflowDefinition,
): FlowcraftValidationResult {
  const issues: FlowcraftValidationIssue[] = [];
  const nodeIds = new Set<FlowcraftNodeId>();

  if (workflow.nodes.length === 0) {
    issues.push({
      code: "flowcraft.workflow.empty",
      message: "Workflow has no nodes",
      node_id: null,
      edge: null,
    });
  }

  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push({
        code: "flowcraft.workflow.duplicate-node",
        message: `Duplicate node id ${node.id}`,
        node_id: node.id,
        edge: null,
      });
    }

    nodeIds.add(node.id);
  }

  for (const edge of workflow.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      issues.push({
        code: "flowcraft.workflow.invalid-edge",
        message: `Invalid edge ${edge.from} -> ${edge.to}`,
        node_id: null,
        edge,
      });
    }
  }

  const hasClaim = nodeIds.has("claim");
  const hasReconcile = nodeIds.has("reconcile");
  const hasComplete = nodeIds.has("complete");

  if (!hasClaim || !hasReconcile || !hasComplete) {
    issues.push({
      code: "flowcraft.workflow.missing-phase",
      message: "Workflow must include claim, reconcile, and complete phases",
      node_id: null,
      edge: null,
    });
  }

  return {
    workflow_id: workflow.id,
    valid: issues.length === 0,
    issues,
  };
}

function renderNode(node: FlowcraftNodeDefinition): string {
  switch (node.kind) {
    case "task":
      return `${node.id}["${node.title}"]`;
    case "terminal":
      return `${node.id}(("${node.title}"))`;
  }
}

function renderEdge(edge: FlowcraftEdgeDefinition): string {
  return edge.label === undefined
    ? `${edge.from} --> ${edge.to}`
    : `${edge.from} -- ${edge.label} --> ${edge.to}`;
}

function renderWorkflowDiagram(workflow: FlowcraftWorkflowDefinition): string {
  const lines = [
    "flowchart TD",
    `  %% ${workflow.id} v${workflow.version}`,
    ...workflow.nodes.map((node) => `  ${renderNode(node)}`),
    ...workflow.edges.map((edge) => `  ${renderEdge(edge)}`),
  ];

  return `${lines.join("\n")}\n`;
}

function phaseEventsForIssue(input: {
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  transport: TransportCorrelation | null;
}): FlowcraftPhaseEvent[] {
  return [
    {
      phase: "claim",
      type: "workflow.phase.claimed",
      state: "claimed",
      message: "Issue claimed",
      occurred_at: input.started_at,
      data: {
        issue_id: input.issue_id,
        run_id: input.run_id,
        execution_id: input.execution_id,
        transport: input.transport,
      },
    },
    {
      phase: "reconcile",
      type: "workflow.phase.reconciled",
      state: "reconciling",
      message: "Issue reconciled",
      occurred_at: input.started_at,
      data: {
        issue_id: input.issue_id,
        run_id: input.run_id,
        execution_id: input.execution_id,
        transport: input.transport,
      },
    },
    {
      phase: "complete",
      type: "workflow.phase.completed",
      state: "completed",
      message: "Issue completed",
      occurred_at: input.started_at,
      data: {
        issue_id: input.issue_id,
        run_id: input.run_id,
        execution_id: input.execution_id,
        transport: input.transport,
      },
    },
  ];
}

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

export function buildFlowcraftExecutionPlan(input: {
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  finished_at: string;
  transport: TransportCorrelation | null;
}): FlowcraftExecutionPlan {
  const workflow = flowcraftWorkflows[0];
  const metadata = {
    workflow_id: workflow.id,
    workflow_version: workflow.version,
    bounded: true,
    transport: input.transport,
  };

  const phaseEvents = phaseEventsForIssue({
    issue_id: input.issue_id,
    run_id: input.run_id,
    execution_id: input.execution_id,
    started_at: input.started_at,
    transport: input.transport,
  });

  return {
    workflow,
    execution_id: input.execution_id,
    run_id: input.run_id,
    issue_id: input.issue_id,
    started_at: input.started_at,
    finished_at: input.finished_at,
    transport: input.transport,
    metadata,
    flowcraft_events: [
      {
        flowcraft_event_id: `${input.execution_id}-started`,
        execution_id: input.execution_id,
        node_id: "claim",
        type: "execution.started",
        occurred_at: input.started_at,
        data: {
          issue_id: input.issue_id,
          run_id: input.run_id,
          workflow_id: workflow.id,
          workflow_version: workflow.version,
          transport: input.transport,
        },
      },
      ...phaseEvents.flatMap((event) => [
        {
          flowcraft_event_id: `${input.execution_id}-${event.phase}-entered`,
          execution_id: input.execution_id,
          node_id: event.phase,
          type: "node.entered",
          occurred_at: input.started_at,
          data: {
            issue_id: input.issue_id,
            run_id: input.run_id,
            workflow_id: workflow.id,
            workflow_version: workflow.version,
            phase: event.phase,
            transport: input.transport,
          },
        },
        {
          flowcraft_event_id: `${input.execution_id}-${event.phase}-completed`,
          execution_id: input.execution_id,
          node_id: event.phase,
          type: "node.completed",
          occurred_at: event.occurred_at,
          data: {
            issue_id: input.issue_id,
            run_id: input.run_id,
            workflow_id: workflow.id,
            workflow_version: workflow.version,
            phase: event.phase,
            phase_state: event.state,
            transport: input.transport,
          },
        },
      ]),
      {
        flowcraft_event_id: `${input.execution_id}-finished`,
        execution_id: input.execution_id,
        node_id: "complete",
        type: "execution.completed",
        occurred_at: input.finished_at,
        data: {
          issue_id: input.issue_id,
          run_id: input.run_id,
          workflow_id: workflow.id,
          workflow_version: workflow.version,
          transport: input.transport,
        },
      },
    ],
    domain_events: phaseEvents.map((event, index) => ({
      event_id: `${input.execution_id}-${event.phase}-domain-${index}`,
      issue_id: input.issue_id,
      run_id: input.run_id,
      type: event.type,
      state: event.state,
      message: event.message,
      severity: "info" as const,
      occurred_at: event.occurred_at,
      actor: "autobot-flowcraft",
      transport: input.transport,
      data: {
        ...event.data,
        workflow_id: workflow.id,
        workflow_version: workflow.version,
        phase: event.phase,
      },
    })),
  };
}

export type {
  FlowcraftEdgeDefinition,
  FlowcraftExecutionPlan,
  FlowcraftNodeDefinition,
  FlowcraftNodeId,
  FlowcraftPhaseEvent,
  FlowcraftValidationIssue,
  FlowcraftValidationResult,
  FlowcraftWorkflowDefinition,
  FlowcraftWorkflowSummary,
  FlowcraftWorkflowId,
} from "./types";
