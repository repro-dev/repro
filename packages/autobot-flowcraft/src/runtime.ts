import type { EdgeDefinition } from "./flowcraft";
import type {
  FlowcraftExecutionPlan,
  FlowcraftNodeId,
  FlowcraftNodeImplementation,
  FlowcraftPhaseEvent,
  FlowcraftValidationIssue,
  FlowcraftValidationResult,
  FlowcraftWorkflowContext,
  FlowcraftWorkflowDependencies,
  FlowcraftWorkflowDefinition,
  FlowcraftWorkflowId,
  FlowcraftWorkflowSummary,
} from "./types";
import {
  analyzeBlueprint,
  createFlow,
  generateMermaid,
  lintBlueprint,
  FlowRuntime,
} from "./flowcraft";

import type { TransportCorrelation } from "@repro/autobot-core";

const autobotDeliverIssueWorkflowId: FlowcraftWorkflowId =
  "autobot-deliver-issue";
const autobotDeliverIssueWorkflowVersion = "1.0.0";

const phaseDefinitions: Record<
  FlowcraftNodeId,
  {
    type: string;
    state: FlowcraftPhaseEvent["state"];
    message: string;
  }
> = {
  claim: {
    type: "workflow.phase.claimed",
    state: "claimed",
    message: "Issue claimed",
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

function createPhaseNode(nodeId: FlowcraftNodeId): FlowcraftNodeImplementation {
  return async () => ({
    output: {
      phase: nodeId,
      state: phaseDefinitions[nodeId].state,
    },
  });
}

function createAutobotDeliverIssueWorkflow(): FlowcraftWorkflowDefinition {
  const flow = createFlow<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >(autobotDeliverIssueWorkflowId)
    .node("claim", createPhaseNode("claim"))
    .node("reconcile", createPhaseNode("reconcile"))
    .node("complete", createPhaseNode("complete"))
    .edge("claim", "reconcile")
    .edge("reconcile", "complete");

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
      "Claim an issue, reconcile the local and remote state, then complete the delivery skeleton.",
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

function phaseEventsForIssue(input: {
  workflow: FlowcraftWorkflowDefinition;
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  transport: TransportCorrelation | null;
}): FlowcraftPhaseEvent[] {
  return input.workflow.blueprint.nodes.map((node) => {
    const phase = node.id as FlowcraftNodeId;
    const definition = phaseDefinitions[phase];

    return {
      phase,
      type: definition.type,
      state: definition.state,
      message: definition.message,
      occurred_at: input.started_at,
      data: {
        issue_id: input.issue_id,
        run_id: input.run_id,
        execution_id: input.execution_id,
        workflow_id: input.workflow.id,
        workflow_version: input.workflow.version,
        transport: input.transport,
      },
    };
  });
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
    workflow,
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
  FlowcraftExecutionPlan,
  FlowcraftNodeId,
  FlowcraftNodeImplementation,
  FlowcraftPhaseEvent,
  FlowcraftValidationIssue,
  FlowcraftValidationResult,
  FlowcraftWorkflowContext,
  FlowcraftWorkflowDefinition,
  FlowcraftWorkflowId,
  FlowcraftWorkflowDependencies,
  FlowcraftWorkflowSummary,
} from "./types";
