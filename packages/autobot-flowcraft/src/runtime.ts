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
import { Future, type FutureInstance } from "fluture";

const autobotDeliverIssueWorkflowId: FlowcraftWorkflowId =
  "autobot-deliver-issue";
const autobotDeliverIssueWorkflowVersion = "1.0.0";
const reviewAttemptLimit = 3;
const reviewLoopId = "review-loop" as const;
const reviewFixNodeId = "review_fix" as const;

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

type NodeExecutionContext = {
  input?: unknown;
  context?: unknown;
  dependencies?: {
    workflowState?: {
      getContext?: () => {
        set: (key: string, value: unknown) => Promise<void> | void;
        toJSON?: () =>
          | Promise<Record<string, unknown>>
          | Record<string, unknown>;
      };
    };
  };
};

async function readNodeSnapshot(
  nodeContext?: NodeExecutionContext,
): Promise<Record<string, unknown>> {
  if (nodeContext === undefined) {
    return {};
  }

  const contextSnapshot = isRecord(nodeContext.context)
    ? nodeContext.context
    : {};
  const inputSnapshot = isRecord(nodeContext.input) ? nodeContext.input : {};
  const workflowStateContext =
    nodeContext.dependencies?.workflowState?.getContext?.();
  const workflowStateSnapshot = workflowStateContext?.toJSON
    ? await Promise.resolve(workflowStateContext.toJSON())
    : {};

  return {
    ...inputSnapshot,
    ...contextSnapshot,
    ...(isRecord(workflowStateSnapshot) ? workflowStateSnapshot : {}),
  };
}

function toPhaseId(nodeId: FlowcraftNodeId): FlowcraftPhaseId | null {
  if (nodeId === reviewFixNodeId) {
    return "review-fix";
  }

  return nodeId in phaseDefinitions ? (nodeId as FlowcraftPhaseId) : null;
}

function pickReviewControlFields(
  snapshot: Record<string, unknown>,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (typeof snapshot.review_attempts === "number") {
    fields.review_attempts = snapshot.review_attempts;
  }

  if (typeof snapshot.review_max_attempts === "number") {
    fields.review_max_attempts = snapshot.review_max_attempts;
  }

  if (typeof snapshot.review_requested === "boolean") {
    fields.review_requested = snapshot.review_requested;
  }

  if (typeof snapshot.review_continue === "boolean") {
    fields.review_continue = snapshot.review_continue;
  }

  if (typeof snapshot.review_should_reconcile === "boolean") {
    fields.review_should_reconcile = snapshot.review_should_reconcile;
  }

  if (typeof snapshot.review_should_escalate === "boolean") {
    fields.review_should_escalate = snapshot.review_should_escalate;
  }

  if (typeof snapshot.review_fix_continue === "boolean") {
    fields.review_fix_continue = snapshot.review_fix_continue;
  }

  if (typeof snapshot.review_fix_should_reconcile === "boolean") {
    fields.review_fix_should_reconcile = snapshot.review_fix_should_reconcile;
  }

  if (typeof snapshot.review_fix_should_escalate === "boolean") {
    fields.review_fix_should_escalate = snapshot.review_fix_should_escalate;
  }

  if (Array.isArray(snapshot.phase_history)) {
    fields.phase_history = snapshot.phase_history.filter(
      (entry) => typeof entry === "string",
    );
  }

  return fields;
}

function createPhaseNode(
  nodeId: FlowcraftPhaseId | typeof reviewFixNodeId,
): FlowcraftNodeImplementation {
  return async (nodeContext?: NodeExecutionContext) => {
    const snapshot = await readNodeSnapshot(nodeContext);
    const phaseId = toPhaseId(nodeId);

    if (phaseId === null) {
      throw new Error(`createPhaseNode cannot render control node ${nodeId}`);
    }

    return {
      output: {
        phase: phaseId,
        state: phaseDefinitions[phaseId].state,
        ...pickReviewControlFields(snapshot),
      },
    };
  };
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

function createReviewFixNode(): FlowcraftNodeImplementation {
  return async (nodeContext?: NodeExecutionContext) => {
    const snapshot = await readNodeSnapshot(nodeContext);
    const reviewAttempts =
      typeof snapshot.review_attempts === "number"
        ? snapshot.review_attempts
        : 0;
    const reviewMaxAttempts =
      typeof snapshot.review_max_attempts === "number"
        ? snapshot.review_max_attempts
        : reviewAttemptLimit;
    const reviewRequested = snapshot.review_requested === true;
    const nextReviewAttempts = reviewAttempts + 1;
    const reviewContinue =
      reviewRequested && nextReviewAttempts < reviewMaxAttempts;
    const reviewShouldEscalate = reviewRequested && !reviewContinue;
    const reviewFixSnapshot = {
      review_attempts: nextReviewAttempts,
      review_max_attempts: reviewMaxAttempts,
      review_requested: reviewRequested,
      review_continue: reviewContinue,
      review_should_reconcile: reviewRequested ? false : true,
      review_should_escalate: reviewShouldEscalate,
      review_fix_continue: reviewContinue,
      review_fix_should_reconcile: reviewRequested ? false : true,
      review_fix_should_escalate: reviewShouldEscalate,
    };

    const workflowStateContext =
      nodeContext?.dependencies?.workflowState?.getContext?.();
    if (workflowStateContext !== undefined) {
      await Promise.all(
        Object.entries(reviewFixSnapshot).map(([key, value]) =>
          Promise.resolve(workflowStateContext.set(key, value)),
        ),
      );
    }

    return {
      output: {
        phase: "review-fix",
        state: phaseDefinitions["review-fix"].state,
        ...pickReviewControlFields(snapshot),
        ...reviewFixSnapshot,
      },
    };
  };
}

function getNodeState(nodeId: FlowcraftNodeId): ItemState {
  const phaseId = toPhaseId(nodeId);

  if (phaseId !== null) {
    return phaseDefinitions[phaseId].state;
  }

  return nodeId === "escalated"
    ? controlNodeDefinitions.escalated.state
    : controlNodeDefinitions["review-loop"].state;
}

function createAutobotDeliverIssueWorkflow(): FlowcraftWorkflowDefinition {
  const flow = createFlow<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >(autobotDeliverIssueWorkflowId)
    .node("claim", createPhaseNode("claim"), { config: { maxRetries: 1 } })
    .node("preparing", createPhaseNode("preparing"), {
      config: { maxRetries: 1 },
    })
    .node("planning", createPhaseNode("planning"), {
      config: { maxRetries: 1 },
    })
    .node("developing", createPhaseNode("developing"), {
      config: {
        maxRetries: 2,
        retryDelay: 5_000,
        timeout: 60_000,
        joinStrategy: "any",
      },
    })
    .node("testing", createPhaseNode("testing"), {
      config: { maxRetries: 2, retryDelay: 5_000, timeout: 120_000 },
    })
    .node("reviewing", createPhaseNode("reviewing"), {
      config: { maxRetries: 1, retryDelay: 5_000, timeout: 60_000 },
    })
    .node(reviewFixNodeId, createReviewFixNode(), {
      config: { maxRetries: 1, timeout: 60_000 },
    })
    .loop("review-loop", {
      startNodeId: "developing",
      endNodeId: reviewFixNodeId,
      condition: "review_fix_continue",
    })
    .node("reconcile", createPhaseNode("reconcile"))
    .node("escalated", createControlNode("escalated"))
    .node("complete", createPhaseNode("complete"))
    .edge("claim", "preparing")
    .edge("preparing", "planning")
    .edge("planning", "developing")
    .edge("developing", "testing")
    .edge("testing", "reviewing")
    .edge("reviewing", reviewFixNodeId)
    .edge("review-loop", "reconcile", {
      condition: "review_fix_should_reconcile",
    })
    .edge("review-loop", "escalated", {
      condition: "review_fix_should_escalate",
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
    resiliency_notes: [
      "developing and testing use bounded retries with explicit timeouts; fallback/recover is intentionally not used because those phases should surface actionable failures to the supervisor",
      "reviewing and review-fix stay in the bounded loop instead of using recover hooks so review iterations remain visible in execution history",
      "reconcile and complete are terminal handoff phases and do not use fallback semantics",
    ],
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
  runtimeResult: {
    context: FlowcraftWorkflowContext & Record<string, unknown>;
    serializedContext: string;
    status: FlowcraftWorkflowStatus;
  };
  nodeOutputs: FlowcraftExecutionNodeOutput[];
}): FlowcraftExecutionMetadata {
  const latestReviewFixOutput = [...input.nodeOutputs]
    .reverse()
    .find((output) => output.node_id === reviewFixNodeId)?.output;
  const workflowStatus: FlowcraftWorkflowStatus = input.nodeOutputs.some(
    (output) => output.node_id === "escalated",
  )
    ? "escalated"
    : input.runtimeResult.status;
  const itemState = mapFlowcraftStatusToItemState(workflowStatus);
  const phaseOutputs = input.nodeOutputs.filter(
    (output): output is FlowcraftExecutionNodeOutput =>
      toPhaseId(output.node_id) !== null,
  );
  const developingAttempts = input.nodeOutputs.filter(
    (output) => output.node_id === "developing",
  ).length;
  const attemptLimit =
    typeof latestReviewFixOutput?.review_max_attempts === "number"
      ? latestReviewFixOutput.review_max_attempts
      : typeof input.runtimeResult.context.review_max_attempts === "number"
      ? input.runtimeResult.context.review_max_attempts
      : reviewAttemptLimit;
  const loop: FlowcraftExecutionLoopMetadata = {
    id: reviewLoopId,
    attempt_limit: attemptLimit,
    attempts:
      typeof latestReviewFixOutput?.review_attempts === "number"
        ? latestReviewFixOutput.review_attempts
        : Math.max(1, developingAttempts),
    exhausted: latestReviewFixOutput?.review_should_escalate === true,
    continued: latestReviewFixOutput?.review_continue === true,
    body: ["developing", "testing", "reviewing", "review-fix"],
  };

  return {
    workflow_id: input.workflow.id,
    workflow_version: input.workflow.version,
    workflow_status: workflowStatus,
    item_state: itemState,
    bounded: true,
    phase_sequence: phaseOutputs.map(
      (output) => toPhaseId(output.node_id) as FlowcraftPhaseId,
    ),
    loop,
    node_outputs: input.nodeOutputs,
    recovery_commands: getFlowcraftRecoveryCommands(
      workflowStatus,
      input.runtimeResult.context.issue_id,
    ),
    terminal_state: {
      state: itemState,
      reason:
        workflowStatus === "completed"
          ? "workflow completed"
          : workflowStatus === "escalated"
          ? "human handoff requested"
          : workflowStatus === "awaiting"
          ? "waiting for external input"
          : workflowStatus === "cancelled"
          ? "run cancelled"
          : workflowStatus === "stalled"
          ? "workflow stalled"
          : "workflow failed",
    },
    serialized_context: input.runtimeResult.serializedContext,
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
    .filter(
      (event) =>
        toPhaseId(event.node_id) !== null || event.node_id === "escalated",
    )
    .map((event, index) => {
      const phase =
        toPhaseId(event.node_id) ?? (event.node_id as FlowcraftPhaseId);
      const phaseDefinition =
        phase in phaseDefinitions
          ? phaseDefinitions[phase]
          : controlNodeDefinitions.escalated;
      return {
        event_id: `${input.execution_id}-${phase}-domain-${index}`,
        issue_id: input.issue_id,
        run_id: input.run_id,
        type: phaseDefinition.type,
        state: phaseDefinition.state,
        message: phaseDefinition.message,
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

function createExecutionPlan(input: {
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  finished_at: string;
  transport: TransportCorrelation | null;
}): FutureInstance<unknown, FlowcraftExecutionPlan> {
  const workflow = flowcraftWorkflows[0];

  return Future((reject, resolveFuture) => {
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
        review_attempts: 0,
        review_max_attempts: reviewAttemptLimit,
        review_requested: false,
        review_continue: false,
        review_should_reconcile: true,
        review_should_escalate: false,
        phase_history: [],
        transport: input.transport,
      })
      .then((result) => {
        const nodeOutputs = capturedEvents
          .filter(
            (event) =>
              event.type === "node:finish" &&
              typeof event.payload.nodeId === "string" &&
              (toPhaseId(event.payload.nodeId as FlowcraftNodeId) !== null ||
                event.payload.nodeId === "review-loop" ||
                event.payload.nodeId === "escalated"),
          )
          .map((event) => {
            const nodeId = event.payload.nodeId as FlowcraftNodeId;
            const resultPayload = isRecord(event.payload.result)
              ? event.payload.result
              : null;
            const output =
              resultPayload !== null && isRecord(resultPayload.output)
                ? resultPayload.output
                : isRecord(resultPayload?.output)
                ? resultPayload.output
                : {
                    phase: nodeId,
                    state: getNodeState(nodeId),
                  };

            return {
              node_id: nodeId,
              state: getNodeState(nodeId),
              output: output as Record<string, unknown>,
              occurred_at: input.started_at,
            };
          });
        const metadata = createFlowcraftExecutionMetadata({
          workflow,
          runtimeResult: result as {
            context: FlowcraftWorkflowContext & Record<string, unknown>;
            serializedContext: string;
            status: FlowcraftWorkflowStatus;
          },
          nodeOutputs,
        });

        const flowcraft_events = capturedEvents.map((event, index) =>
          createCapturedRuntimeEventRecord({
            execution_id: input.execution_id,
            event,
            index,
            occurred_at:
              event.type === "workflow:finish"
                ? input.finished_at
                : input.started_at,
          }),
        );

        resolveFuture({
          workflow,
          execution_id: input.execution_id,
          run_id: input.run_id,
          issue_id: input.issue_id,
          started_at: input.started_at,
          finished_at: input.finished_at,
          transport: input.transport,
          metadata,
          flowcraft_events,
          domain_events: createPhaseEventsFromRun({
            workflow,
            issue_id: input.issue_id,
            run_id: input.run_id,
            execution_id: input.execution_id,
            transport: input.transport,
            started_at: input.started_at,
            phaseOutputs: nodeOutputs.filter(
              (output) =>
                toPhaseId(output.node_id) !== null ||
                output.node_id === "escalated",
            ),
          }),
        });
      }, reject);

    return () => undefined;
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

export function executeAutobotDeliverIssueWorkflow(input: {
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  finished_at: string;
  transport: TransportCorrelation | null;
}): FutureInstance<unknown, FlowcraftExecutionPlan> {
  return createExecutionPlan(input);
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
