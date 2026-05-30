import type { EdgeDefinition } from "./flowcraft-runtime";
import type {
  FlowcraftArtifactReader,
  FlowcraftArtifactWriter,
  FlowcraftPlanningArtifactDraft,
  FlowcraftPlanningSessionArtifactPaths,
  FlowcraftPlanningSessionResult,
  FlowcraftPlanningSessionRunner,
  FlowcraftExecutionLoopMetadata,
  FlowcraftExecutionMetadata,
  FlowcraftExecutionNodeOutput,
  FlowcraftExecutionPlan,
  FlowcraftNodeId,
  FlowcraftNodeImplementation,
  FlowcraftPhaseProgressRecord,
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

import { createHash } from "node:crypto";
import path from "node:path";
import type { ItemState, TransportCorrelation } from "@repro/autobot-core";
import { Future, fork, type FutureInstance } from "fluture";

const autobotDeliverIssueWorkflowId: FlowcraftWorkflowId =
  "autobot-deliver-issue";
const autobotDeliverIssueWorkflowVersion = "1.0.0";
const reviewAttemptLimit = 3;
const reviewLoopId = "review-loop" as const;
const reviewFixNodeId = "review_fix" as const;

type PlanningReadiness =
  | "ready_to_proceed"
  | "needs_research"
  | "not_ready"
  | "escalate"
  | null;

type PlanningRunPlanAssessment = {
  errors: string[];
  readiness: PlanningReadiness;
};

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
  "review-loop" | "planning-failed" | "escalated",
  PhaseDefinition
> = {
  "review-loop": {
    type: "workflow.phase.review_loop",
    state: "reviewing",
    message: "Review loop evaluated",
  },
  "planning-failed": {
    type: "workflow.phase.planning_failed",
    state: "failed",
    message: "Planning failed",
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

type NodeExecutionContext = any;

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

    const output = {
      phase: phaseId,
      state: phaseDefinitions[phaseId].state,
      ...pickReviewControlFields(snapshot),
    };

    if (phaseId === "preparing") {
      await persistPhaseProgress({
        nodeContext,
        snapshot,
        phase: phaseId,
        output,
      });
    }

    return {
      output,
    };
  };
}

function createControlNode(
  nodeId: "review-loop" | "planning-failed" | "escalated",
): FlowcraftNodeImplementation {
  return async () => ({
    output: {
      phase: nodeId,
      state: controlNodeDefinitions[nodeId].state,
    },
  });
}

function createReviewLoopNode(): FlowcraftNodeImplementation {
  return async (nodeContext?: NodeExecutionContext) => {
    const snapshot = await readNodeSnapshot(nodeContext);

    return {
      output: {
        phase: "review-loop",
        state: controlNodeDefinitions["review-loop"].state,
        review_fix_continue: snapshot.review_fix_continue === true,
        review_fix_should_reconcile:
          snapshot.review_fix_should_reconcile === true,
        review_fix_should_escalate:
          snapshot.review_fix_should_escalate === true,
      },
    };
  };
}

function futureToPromise<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    future.pipe(fork(reject)(resolve));
  });
}

function getPhaseProgressRecoveryCommands(issueId: string): string[] {
  return [
    `autobot-next status ${issueId} --json`,
    `autobot-next logs ${issueId} --json`,
  ];
}

async function persistPhaseProgress(input: {
  nodeContext?: NodeExecutionContext;
  snapshot: Record<string, unknown>;
  phase: "preparing" | "planning";
  output: Record<string, unknown>;
}): Promise<void> {
  const planning = input.nodeContext?.dependencies?.autobotPlanning;
  const progressWriter = planning?.progressWriter;

  if (progressWriter === undefined) {
    return;
  }

  const runId = String(input.snapshot.run_id ?? input.snapshot.runId ?? "");
  const executionId = String(
    input.snapshot.execution_id ??
      input.snapshot.executionId ??
      input.nodeContext?.dependencies?.runtime?.executionId ??
      "",
  );
  const issueId = String(
    input.snapshot.issue_id ??
      input.snapshot.issueId ??
      planning?.item?.issue_id ??
      "",
  );
  const phaseDefinition = phaseDefinitions[input.phase];
  const occurredAt = planning?.progressClock?.() ?? new Date().toISOString();
  const nodeOutput = {
    node_id: input.phase,
    state: phaseDefinition.state,
    output: input.output,
    occurred_at: occurredAt,
  } satisfies FlowcraftPhaseProgressRecord["node_output"];
  const serializedContext = JSON.stringify(
    stripNestedTransport({
      ...input.snapshot,
      [input.phase]: input.output,
      [`_outputs.${input.phase}`]: input.output,
    }),
  );

  await futureToPromise(
    progressWriter({
      issue_id: issueId,
      run_id: runId,
      execution_id: executionId,
      workflow_id: autobotDeliverIssueWorkflowId,
      workflow_version: autobotDeliverIssueWorkflowVersion,
      phase: input.phase,
      state: phaseDefinition.state,
      event_type: phaseDefinition.type,
      message: phaseDefinition.message,
      occurred_at: occurredAt,
      recovery_commands: getPhaseProgressRecoveryCommands(issueId),
      serialized_context: serializedContext,
      node_output: nodeOutput,
    }),
  );
}

function createContentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function assessPlanningRunPlanContent(
  content: string,
): PlanningRunPlanAssessment {
  const lines = content.split(/\r?\n/);
  const getHeadingLine = (heading: string): number =>
    lines.findIndex((line) => line.trim() === `## ${heading}`);
  const getSectionBody = (heading: string): string | null => {
    const headingLine = getHeadingLine(heading);

    if (headingLine === -1) {
      return null;
    }

    const nextHeadingLine = lines.findIndex(
      (line, index) => index > headingLine && line.startsWith("## "),
    );
    const endLine = nextHeadingLine === -1 ? lines.length : nextHeadingLine;

    return lines
      .slice(headingLine + 1, endLine)
      .join("\n")
      .trim();
  };
  const getFirstContentLine = (heading: string): string | null => {
    const body = getSectionBody(heading);
    if (body === null) {
      return null;
    }

    const firstContentLine = body
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0);

    return firstContentLine?.trim() ?? null;
  };
  const normalizePlanningSentinel = (value: string | null): string | null => {
    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    const unwrapped =
      trimmed.startsWith("`") && trimmed.endsWith("`") && trimmed.length >= 2
        ? trimmed.slice(1, -1).trim()
        : trimmed;

    return unwrapped.toLowerCase();
  };
  const requiredHeadings = [
    "Readiness",
    "Sequence Notes",
    "Risk Notes",
    "Plan",
  ];
  const missingHeadings = requiredHeadings
    .filter((heading) => getHeadingLine(heading) === -1)
    .map((heading) => `missing ## ${heading}`);
  const emptySections = requiredHeadings.filter((heading) => {
    const body = getSectionBody(heading);
    return body === null || body.length === 0;
  });
  const emptySectionErrors = emptySections.map(
    (heading) => `empty ## ${heading}`,
  );
  const hasOpenQuestions = getHeadingLine("Open Questions") !== -1;
  const readinessSentinel = normalizePlanningSentinel(
    getFirstContentLine("Readiness"),
  );
  const readiness =
    readinessSentinel === "ready_to_proceed"
      ? "ready_to_proceed"
      : readinessSentinel === "needs_research"
      ? "needs_research"
      : readinessSentinel === "not_ready" ||
        readinessSentinel === "not_ready_to_proceed"
      ? "not_ready"
      : readinessSentinel === "escalate"
      ? "escalate"
      : null;
  const invalidOpenQuestions =
    hasOpenQuestions && readiness === "ready_to_proceed"
      ? ["## Open Questions is only allowed when ## Readiness is not ready"]
      : [];
  const emptyOpenQuestions =
    hasOpenQuestions && (getSectionBody("Open Questions")?.length ?? 0) === 0
      ? ["empty ## Open Questions"]
      : [];
  const invalidReadiness =
    readiness === null
      ? [
          "## Readiness must start with one of: ready_to_proceed, needs_research, not_ready, not_ready_to_proceed, escalate",
        ]
      : [];

  return {
    errors: [
      ...missingHeadings,
      ...emptySectionErrors,
      ...emptyOpenQuestions,
      ...invalidOpenQuestions,
      ...invalidReadiness,
    ],
    readiness,
  };
}

function createPlanningNode(): FlowcraftNodeImplementation {
  return async (nodeContext?: NodeExecutionContext) => {
    const snapshot = await readNodeSnapshot(nodeContext);
    const phaseId = "planning" as const;
    const planning = nodeContext?.dependencies?.autobotPlanning;

    if (
      planning === undefined ||
      nodeContext?.dependencies?.runtime === undefined ||
      nodeContext.dependencies.runtime.executionId === undefined
    ) {
      return {
        output: {
          phase: phaseId,
          state: phaseDefinitions[phaseId].state,
          ...pickReviewControlFields(snapshot),
        },
      };
    }

    const { artifactDrafts, artifactPaths, artifactReader, artifactWriter } =
      planning as {
        artifactDrafts: FlowcraftPlanningArtifactDraft[];
        artifactPaths: FlowcraftPlanningSessionArtifactPaths;
        artifactReader: FlowcraftArtifactReader;
        artifactWriter: FlowcraftArtifactWriter;
        planningSessionRunner: FlowcraftPlanningSessionRunner;
        repo: { path: string; state_dir: string };
        item: { issue_id: string; attempt: number };
      };
    const runId = String(snapshot.run_id ?? snapshot.runId ?? "");
    const executionId = String(
      snapshot.execution_id ??
        snapshot.executionId ??
        nodeContext.dependencies.runtime.executionId,
    );
    const eventBus = nodeContext.dependencies.runtime.services.eventBus;
    let planningSessionResult: FlowcraftPlanningSessionResult | null = null;
    let runPlanAssessment: PlanningRunPlanAssessment = {
      errors: [],
      readiness: null,
    };
    let planningRunPlanValid = false;
    let planningRunPlanReady = false;
    let planningArtifacts = artifactDrafts;
    let planningFailureReason: string | null = null;

    try {
      await Promise.all(
        artifactDrafts
          .filter(
            (draft: FlowcraftPlanningArtifactDraft) => draft.persist !== false,
          )
          .map((draft: FlowcraftPlanningArtifactDraft) =>
            futureToPromise(
              artifactWriter({
                path: path.join(planning.repo.path, draft.path),
                content: draft.content,
              }),
            ),
          ),
      );

      await eventBus.emit({
        type: "workflow.planner.started",
        payload: {
          issueId: planning.item.issue_id,
          runId,
          executionId,
          artifactPaths,
        },
      });

      if (planning.planningWorkerStarter !== undefined) {
        await futureToPromise(
          planning.planningWorkerStarter({
            repo: planning.repo,
            issueId: planning.item.issue_id,
            attempt: planning.item.attempt,
            runId,
            executionId,
            artifactPaths,
          }),
        );
        await nodeContext.dependencies.workflowState?.markAsAwaiting?.(
          phaseId,
          {
            reason: "planning_worker_running",
          },
        );

        return {
          output: {
            phase: phaseId,
            state: phaseDefinitions[phaseId].state,
            planning_run_plan_valid: false,
            planning_run_plan_ready: false,
            planning_readiness: null,
            planning_artifacts: planningArtifacts,
            planning_should_fail: false,
            planning_failure_reason: null,
            planning_session_result: null,
            planning_worker_running: true,
            ...pickReviewControlFields(snapshot),
          },
        };
      }

      planningSessionResult = await futureToPromise(
        planning.planningSessionRunner({
          repo: planning.repo,
          issueId: planning.item.issue_id,
          attempt: planning.item.attempt,
          runId,
          executionId,
          artifactPaths,
        }),
      );

      const sessionResult = planningSessionResult;

      if (sessionResult === null) {
        throw new Error("planning session result missing");
      }

      if (sessionResult.stdout.length > 0) {
        await eventBus.emit({
          type: "workflow.planner.stdout",
          payload: {
            issueId: planning.item.issue_id,
            runId,
            executionId,
            output: sessionResult.stdout,
          },
        });
      }

      if (sessionResult.stderr.length > 0) {
        await eventBus.emit({
          type: "workflow.planner.stderr",
          payload: {
            issueId: planning.item.issue_id,
            runId,
            executionId,
            output: sessionResult.stderr,
          },
        });
      }

      await eventBus.emit({
        type: "workflow.planner.finished",
        payload: {
          issueId: planning.item.issue_id,
          runId,
          executionId,
          command: sessionResult.command,
          args: sessionResult.args,
          exitCode: sessionResult.exit_code,
          signal: sessionResult.signal,
        },
      });

      const planningSucceeded =
        sessionResult.exit_code === 0 && sessionResult.signal === null;

      if (!planningSucceeded) {
        planningFailureReason = `planning session exited with code ${String(
          sessionResult.exit_code,
        )}`;
      } else {
        const runPlanContent = String(
          await futureToPromise(
            artifactReader({ path: artifactPaths.runPlan }),
          ),
        );
        runPlanAssessment = assessPlanningRunPlanContent(runPlanContent);
        planningRunPlanValid = runPlanAssessment.errors.length === 0;
        planningRunPlanReady =
          planningRunPlanValid &&
          runPlanAssessment.readiness === "ready_to_proceed";
        planningArtifacts = planningRunPlanValid
          ? (artifactDrafts.map((draft: FlowcraftPlanningArtifactDraft) =>
              draft.kind === "run-plan"
                ? {
                    ...draft,
                    content: runPlanContent,
                    content_hash: createContentHash(runPlanContent),
                    persist: true,
                  }
                : draft,
            ) as FlowcraftPlanningArtifactDraft[])
          : artifactDrafts;

        if (!planningRunPlanValid) {
          planningFailureReason = `planning session produced invalid run-plan.md: ${runPlanAssessment.errors.join(
            ", ",
          )}`;
        } else if (!planningRunPlanReady) {
          await nodeContext.dependencies.workflowState?.markAsAwaiting?.(
            phaseId,
            {
              reason: "run_plan_not_ready",
            },
          );
        }
      }
    } catch (error) {
      planningFailureReason =
        error instanceof Error && error.message.length > 0
          ? error.message
          : "planning session failed";
    }

    const workflowStateContext =
      nodeContext?.dependencies?.workflowState?.getContext?.();
    if (workflowStateContext !== undefined) {
      await Promise.all(
        Object.entries({
          planning_run_plan_valid: planningRunPlanValid,
          planning_run_plan_ready: planningRunPlanReady,
          planning_readiness: runPlanAssessment.readiness,
          planning_should_fail: planningFailureReason !== null,
          planning_failure_reason: planningFailureReason,
          planning_session_result:
            planningSessionResult === null
              ? null
              : {
                  command: planningSessionResult.command,
                  args: planningSessionResult.args,
                  started_at: planningSessionResult.started_at,
                  finished_at: planningSessionResult.finished_at,
                  exit_code: planningSessionResult.exit_code,
                  signal: planningSessionResult.signal,
                  stdout: planningSessionResult.stdout,
                  stderr: planningSessionResult.stderr,
                },
        }).map(([key, value]) =>
          Promise.resolve(workflowStateContext.set(key, value)),
        ),
      );
    }

    const output = {
      phase: phaseId,
      state: phaseDefinitions[phaseId].state,
      planning_run_plan_valid: planningRunPlanValid,
      planning_run_plan_ready: planningRunPlanReady,
      planning_readiness: runPlanAssessment.readiness,
      planning_artifacts: planningArtifacts,
      planning_should_fail: planningFailureReason !== null,
      planning_failure_reason: planningFailureReason,
      planning_session_result:
        planningSessionResult === null
          ? null
          : {
              command: planningSessionResult.command,
              args: planningSessionResult.args,
              started_at: planningSessionResult.started_at,
              finished_at: planningSessionResult.finished_at,
              exit_code: planningSessionResult.exit_code,
              signal: planningSessionResult.signal,
              stdout: planningSessionResult.stdout,
              stderr: planningSessionResult.stderr,
            },
      ...pickReviewControlFields(snapshot),
    };

    if (planningRunPlanValid) {
      await persistPhaseProgress({
        nodeContext,
        snapshot,
        phase: phaseId,
        output,
      });
    }

    return { output };
  };
}

function createPlanningFailureNode(): FlowcraftNodeImplementation {
  return async (nodeContext?: NodeExecutionContext) => {
    const snapshot = await readNodeSnapshot(nodeContext);
    const reason =
      typeof snapshot.planning_failure_reason === "string" &&
      snapshot.planning_failure_reason.length > 0
        ? snapshot.planning_failure_reason
        : "planning failed";

    nodeContext?.dependencies?.workflowState?.addError?.(
      "planning-failed",
      new Error(reason),
    );

    return {
      output: {
        phase: "planning-failed",
        state: controlNodeDefinitions["planning-failed"].state,
        planning_failure_reason: reason,
      },
    };
  };
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

  return controlNodeDefinitions[nodeId as keyof typeof controlNodeDefinitions]
    .state;
}

type PlanningNodeOutput = {
  planning_artifacts?: unknown[];
  planning_session_result?: {
    command?: unknown;
    args?: unknown;
    started_at?: unknown;
    finished_at?: unknown;
    exit_code?: unknown;
    signal?: unknown;
    stdout?: unknown;
    stderr?: unknown;
  } | null;
  planning_run_plan_valid?: unknown;
  planning_run_plan_ready?: unknown;
  planning_should_fail?: unknown;
  planning_failure_reason?: unknown;
};

function createAutobotDeliverIssueWorkflow(): FlowcraftWorkflowDefinition {
  const flow = createFlow<
    FlowcraftWorkflowContext,
    FlowcraftWorkflowDependencies
  >(autobotDeliverIssueWorkflowId)
    .node("claim", createPhaseNode("claim"), { config: { maxRetries: 1 } })
    .node("preparing", createPhaseNode("preparing"), {
      config: { maxRetries: 1 },
    })
    .node("planning", createPlanningNode(), {
      config: { maxRetries: 1 },
    })
    .node("planning-failed", createPlanningFailureNode())
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
    .node("review-loop", createReviewLoopNode())
    .node("reconcile", createPhaseNode("reconcile"))
    .node("escalated", createControlNode("escalated"))
    .node("complete", createPhaseNode("complete"))
    .edge("claim", "preparing")
    .edge("preparing", "planning")
    .edge("planning", "planning-failed", {
      condition: "result.output.planning_should_fail",
    })
    .edge("planning", "developing")
    .edge("developing", "testing")
    .edge("testing", "reviewing")
    .edge("reviewing", reviewFixNodeId)
    .edge(reviewFixNodeId, "review-loop")
    .edge("review-loop", "reconcile", {
      condition: "result.output.review_fix_should_reconcile",
    })
    .edge("review-loop", "escalated", {
      condition: "result.output.review_fix_should_escalate",
    })
    .edge("review-loop", "developing", {
      condition: "result.output.review_fix_continue",
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
  const planningOutput = [...input.nodeOutputs]
    .reverse()
    .find((output) => output.node_id === "planning")?.output as
    | PlanningNodeOutput
    | undefined;
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
  const planningArtifacts =
    planningOutput !== undefined &&
    Array.isArray(planningOutput.planning_artifacts)
      ? (planningOutput.planning_artifacts as unknown[]).filter(
          (artifact): artifact is FlowcraftPlanningArtifactDraft =>
            typeof artifact === "object" &&
            artifact !== null &&
            "kind" in artifact &&
            "path" in artifact &&
            "description" in artifact &&
            "content" in artifact &&
            "content_hash" in artifact &&
            typeof (artifact as FlowcraftPlanningArtifactDraft).kind ===
              "string" &&
            typeof (artifact as FlowcraftPlanningArtifactDraft).path ===
              "string" &&
            typeof (artifact as FlowcraftPlanningArtifactDraft).description ===
              "string" &&
            typeof (artifact as FlowcraftPlanningArtifactDraft).content ===
              "string" &&
            typeof (artifact as FlowcraftPlanningArtifactDraft).content_hash ===
              "string",
        )
      : [];
  const planningSessionResultData = planningOutput?.planning_session_result;
  const planningSessionResult =
    isRecord(planningSessionResultData) &&
    typeof planningSessionResultData.command === "string" &&
    Array.isArray(planningSessionResultData.args) &&
    planningSessionResultData.args.every((arg) => typeof arg === "string") &&
    typeof planningSessionResultData.started_at === "string" &&
    typeof planningSessionResultData.finished_at === "string" &&
    (typeof planningSessionResultData.exit_code === "number" ||
      planningSessionResultData.exit_code === null) &&
    (typeof planningSessionResultData.signal === "string" ||
      planningSessionResultData.signal === null)
      ? {
          command: planningSessionResultData.command as string,
          args: [...planningSessionResultData.args] as string[],
          started_at: planningSessionResultData.started_at as string,
          finished_at: planningSessionResultData.finished_at as string,
          exit_code: planningSessionResultData.exit_code as number | null,
          signal: planningSessionResultData.signal as NodeJS.Signals | null,
          stdout:
            typeof planningSessionResultData.stdout === "string"
              ? planningSessionResultData.stdout
              : "",
          stderr:
            typeof planningSessionResultData.stderr === "string"
              ? planningSessionResultData.stderr
              : "",
        }
      : null;
  const planningRunPlanValid = planningOutput?.planning_run_plan_valid === true;
  const planningRunPlanReady = planningOutput?.planning_run_plan_ready === true;
  const planningShouldFail = planningOutput?.planning_should_fail === true;
  const planningFailureReason =
    typeof planningOutput?.planning_failure_reason === "string"
      ? planningOutput.planning_failure_reason
      : null;
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
    planning_artifacts: planningArtifacts,
    planning_session_result: planningSessionResult,
    planning_run_plan_valid: planningRunPlanValid,
    planning_run_plan_ready: planningRunPlanReady,
    planning_should_fail: planningShouldFail,
    planning_failure_reason: planningFailureReason,
    recovery_commands: getFlowcraftRecoveryCommands(
      workflowStatus,
      input.runtimeResult.context.issue_id,
    ),
    safety_stop: null,
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
  finished_at: string;
  planning_session_result: FlowcraftPlanningSessionResult | null;
  phaseOutputs: FlowcraftExecutionNodeOutput[];
}): FlowcraftExecutionPlan["domain_events"] {
  const durablePlanningPhaseIds = new Set<FlowcraftPhaseId>([
    "preparing",
    "planning",
    "complete",
  ]);
  const completedAt =
    input.planning_session_result === null
      ? input.finished_at
      : new Date(
          Date.parse(input.planning_session_result.finished_at) + 1,
        ).toISOString();

  return input.phaseOutputs
    .filter((event) => {
      const phase =
        toPhaseId(event.node_id) ?? (event.node_id as FlowcraftPhaseId);

      return durablePlanningPhaseIds.has(phase);
    })
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
        occurred_at: phase === "complete" ? completedAt : event.occurred_at,
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

function createMonotonicRuntimeEventOccurredAts(input: {
  started_at: string;
  finished_at: string;
  count: number;
}): string[] {
  if (input.count <= 0) {
    return [];
  }

  if (input.count === 1) {
    return [input.started_at];
  }

  const startedAtMs = Date.parse(input.started_at);
  const finishedAtMs = Date.parse(input.finished_at);

  if (!Number.isFinite(startedAtMs) || !Number.isFinite(finishedAtMs)) {
    return Array.from({ length: input.count }, (_value, index) =>
      index === 0
        ? input.started_at
        : index === input.count - 1
        ? input.finished_at
        : input.started_at,
    );
  }

  const occurredAts = Array.from(
    { length: input.count },
    () => input.started_at,
  );
  occurredAts[0] = input.started_at;
  occurredAts[input.count - 1] = input.finished_at;

  if (input.count === 2) {
    return occurredAts;
  }

  const intervalMs = finishedAtMs - startedAtMs;

  if (intervalMs <= 0) {
    for (let index = 1; index < input.count - 1; index += 1) {
      occurredAts[index] = input.started_at;
    }

    return occurredAts;
  }

  for (let index = 1; index < input.count - 1; index += 1) {
    const offsetMs = Math.floor((intervalMs * index) / (input.count - 1));
    const occurredAtMs = Math.max(
      startedAtMs,
      Math.min(finishedAtMs, startedAtMs + offsetMs),
    );
    occurredAts[index] =
      occurredAtMs === startedAtMs
        ? input.started_at
        : occurredAtMs === finishedAtMs
        ? input.finished_at
        : new Date(occurredAtMs).toISOString();
  }

  return occurredAts;
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
  dependencies?: FlowcraftWorkflowDependencies;
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
      dependencies: input.dependencies ?? {},
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
        const capturedEventOccurredAts = createMonotonicRuntimeEventOccurredAts(
          {
            started_at: input.started_at,
            finished_at: input.finished_at,
            count: capturedEvents.length,
          },
        );

        const nodeOutputs = capturedEvents.flatMap((event, index) => {
          if (
            event.type !== "node:finish" ||
            typeof event.payload.nodeId !== "string" ||
            (toPhaseId(event.payload.nodeId as FlowcraftNodeId) === null &&
              event.payload.nodeId !== "review-loop" &&
              event.payload.nodeId !== "escalated")
          ) {
            return [];
          }

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
            occurred_at: capturedEventOccurredAts[index] ?? input.started_at,
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
            occurred_at: capturedEventOccurredAts[index] ?? input.started_at,
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
            finished_at: input.finished_at,
            planning_session_result: metadata.planning_session_result,
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
  dependencies?: FlowcraftWorkflowDependencies;
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
  dependencies?: FlowcraftWorkflowDependencies;
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
  FlowcraftPhaseProgressRecord,
  FlowcraftPhaseProgressWriter,
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
