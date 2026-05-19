import type { EdgeDefinition } from "./flowcraft-runtime";
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
} from "./flowcraft-runtime";

import type { TransportCorrelation } from "@repro/autobot-core";
import { Future, type FutureInstance } from "fluture";

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
    .node("preparing", createPhaseNode("preparing"))
    .node("planning", createPhaseNode("planning"))
    .node("reconcile", createPhaseNode("reconcile"))
    .node("complete", createPhaseNode("complete"))
    .edge("claim", "preparing")
    .edge("preparing", "planning")
    .edge("planning", "reconcile")
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
      "Claim an issue, prepare Linear data, generate planning artifacts, reconcile the state, then complete it.",
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

function createCapturedRuntimeEventRecord(input: {
  execution_id: string;
  event: { type: string; payload: Record<string, unknown> };
  index: number;
  occurred_at: string;
}): {
  flowcraft_event_id: string;
  execution_id: string;
  node_id: FlowcraftNodeId;
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
    node_id: getRuntimeEventNodeId(input.event) as FlowcraftNodeId,
    type: input.event.type,
    occurred_at: input.occurred_at,
    data: stripNestedTransport(input.event.payload),
  };
}

function createPhaseEventsFromRun(input: {
  workflow: FlowcraftWorkflowDefinition;
  issue_id: string;
  run_id: string;
  execution_id: string;
  transport: TransportCorrelation | null;
  started_at: string;
  phaseOutputs: Array<{
    phase: FlowcraftNodeId;
    occurred_at: string;
    output: unknown;
  }>;
}): FlowcraftExecutionPlan["domain_events"] {
  return input.phaseOutputs.map((event, index) => ({
    event_id: `${input.execution_id}-${event.phase}-domain-${index}`,
    issue_id: input.issue_id,
    run_id: input.run_id,
    type: phaseDefinitions[event.phase].type,
    state: phaseDefinitions[event.phase].state,
    message: phaseDefinitions[event.phase].message,
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
      phase: event.phase,
      output: stripNestedTransport(event.output),
      started_at: input.started_at,
    },
  }));
}

export function executeAutobotDeliverIssueWorkflow(input: {
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  finished_at: string;
  transport: TransportCorrelation | null;
}): FutureInstance<unknown, FlowcraftExecutionPlan> {
  return Future(
    (
      reject: (reason: unknown) => void,
      resolve: (value: FlowcraftExecutionPlan) => void,
    ) => {
      const workflow = flowcraftWorkflows[0];
      const capturedEvents: Array<{
        type: string;
        payload: Record<string, unknown>;
      }> = [];
      const runtime = new FlowRuntime<
        FlowcraftWorkflowContext,
        FlowcraftWorkflowDependencies
      >({
        eventBus: {
          emit(event) {
            capturedEvents.push({
              type: event.type,
              payload: stripNestedTransport(
                event.payload as Record<string, unknown>,
              ),
            });
          },
        },
      });

      void workflow.flow
        .run(runtime, {
          issue_id: input.issue_id,
          run_id: input.run_id,
          execution_id: input.execution_id,
          started_at: input.started_at,
          finished_at: input.finished_at,
          transport: input.transport,
        })
        .then((result) => {
          const phaseOutputs = workflow.blueprint.nodes.flatMap((node) => {
            const phase = node.id as FlowcraftNodeId;
            const phaseOutput = (
              result.context as unknown as Record<string, unknown>
            )[phase];
            const nodeFinishEvent = capturedEvents.find(
              (event) =>
                event.type === "node:finish" && event.payload.nodeId === phase,
            );
            const finishedOutput =
              nodeFinishEvent?.payload.result &&
              isRecord(nodeFinishEvent.payload.result)
                ? nodeFinishEvent.payload.result.output ?? phaseOutput
                : phaseOutput;

            return {
              phase,
              occurred_at: input.started_at,
              output: finishedOutput,
            };
          });

          resolve({
            workflow,
            execution_id: input.execution_id,
            run_id: input.run_id,
            issue_id: input.issue_id,
            started_at: input.started_at,
            finished_at: input.finished_at,
            transport: input.transport,
            metadata: {
              workflow_id: workflow.id,
              workflow_version: workflow.version,
              bounded: true,
              status: result.status,
            },
            flowcraft_events: capturedEvents.map((event, index) =>
              createCapturedRuntimeEventRecord({
                execution_id: input.execution_id,
                event,
                index,
                occurred_at:
                  event.type === "workflow:finish"
                    ? input.finished_at
                    : input.started_at,
              }),
            ),
            domain_events: createPhaseEventsFromRun({
              workflow,
              issue_id: input.issue_id,
              run_id: input.run_id,
              execution_id: input.execution_id,
              transport: input.transport,
              started_at: input.started_at,
              phaseOutputs,
            }),
          });
        }, reject);

      return () => undefined;
    },
  );
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
}): FutureInstance<unknown, FlowcraftExecutionPlan> {
  return executeAutobotDeliverIssueWorkflow(input);
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
