import type {
  BlueprintAnalysis,
  EdgeDefinition,
  FlowBuilder,
  LinterResult,
  NodeClass,
  NodeFunction,
  WorkflowBlueprint,
} from "./flowcraft-runtime";

import type {
  ArtifactKind,
  ItemDetail,
  ItemState,
  RepoRef,
  TransportCorrelation,
} from "@repro/autobot-core";
import type { FutureInstance } from "fluture";

export interface FlowcraftPlanningArtifactDraft {
  kind: ArtifactKind;
  path: string;
  description: string;
  content: string;
  content_hash: string;
  persist?: boolean;
}

export interface FlowcraftPlanningSessionArtifactPaths {
  context: string;
  testPlan: string;
  contract: string;
  runPlan: string;
  prompt: string;
}

export interface FlowcraftPlanningSessionInput {
  repo: RepoRef;
  issueId: string;
  attempt: number;
  runId: string;
  executionId: string;
  artifactPaths: FlowcraftPlanningSessionArtifactPaths;
}

export interface FlowcraftPlanningSessionResult {
  command: string;
  args: string[];
  started_at: string;
  finished_at: string;
  exit_code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export type FlowcraftArtifactWriter = (input: {
  path: string;
  content: string;
}) => FutureInstance<unknown, void>;

export type FlowcraftArtifactReader = (input: {
  path: string;
}) => FutureInstance<unknown, string>;

export type FlowcraftPlanningSessionRunner = (
  input: FlowcraftPlanningSessionInput,
) => FutureInstance<unknown, FlowcraftPlanningSessionResult>;

export type FlowcraftPlanningWorkerStarter = (
  input: FlowcraftPlanningSessionInput,
) => FutureInstance<unknown, void>;

export type FlowcraftWorkflowId = "autobot-deliver-issue";

export type FlowcraftPhaseId =
  | "claim"
  | "preparing"
  | "planning"
  | "developing"
  | "testing"
  | "reviewing"
  | "review-fix"
  | "reconcile"
  | "complete";

export type FlowcraftNodeId =
  | FlowcraftPhaseId
  | "review_fix"
  | "review-loop"
  | "planning-failed"
  | "escalated";

export type FlowcraftWorkflowStatus =
  | "completed"
  | "awaiting"
  | "failed"
  | "cancelled"
  | "stalled"
  | "escalated";

export interface FlowcraftWorkflowContext {
  issue_id: string;
  run_id: string;
  execution_id: string;
  started_at: string;
  finished_at: string;
  review_attempts: number;
  review_max_attempts: number;
  review_requested: boolean;
  review_continue: boolean;
  review_should_reconcile: boolean;
  review_should_escalate: boolean;
  phase_history: FlowcraftPhaseId[];
  transport: TransportCorrelation | null;
}

export interface FlowcraftWorkflowDefinition {
  id: FlowcraftWorkflowId;
  version: string;
  description: string;
  resiliency_notes: string[];
  flow: FlowBuilder<FlowcraftWorkflowContext, FlowcraftWorkflowDependencies>;
  runtime: unknown;
  blueprint: WorkflowBlueprint;
  analysis: BlueprintAnalysis;
  lint: LinterResult;
}

export interface FlowcraftWorkflowSummary {
  id: FlowcraftWorkflowId;
  version: string;
  description: string;
  node_ids: FlowcraftNodeId[];
  edge_count: number;
}

export interface FlowcraftValidationIssue {
  source: "analysis" | "lint";
  code: string;
  message: string;
  node_id: FlowcraftNodeId | null;
  edge: EdgeDefinition | null;
}

export interface FlowcraftValidationResult {
  workflow_id: FlowcraftWorkflowId;
  valid: boolean;
  analysis: BlueprintAnalysis;
  lint: LinterResult;
  issues: FlowcraftValidationIssue[];
}

export interface FlowcraftPhaseEvent {
  phase: FlowcraftPhaseId;
  type: string;
  state: ItemState;
  message: string;
  occurred_at: string;
  data: Record<string, unknown>;
}

export interface FlowcraftExecutionNodeOutput {
  node_id: FlowcraftNodeId;
  state: ItemState;
  output: Record<string, unknown>;
  occurred_at: string;
}

export interface FlowcraftExecutionLoopMetadata {
  id: "review-loop";
  attempt_limit: number;
  attempts: number;
  exhausted: boolean;
  continued: boolean;
  body: FlowcraftPhaseId[];
}

export interface FlowcraftExecutionMetadata {
  workflow_id: FlowcraftWorkflowId;
  workflow_version: string;
  workflow_status: FlowcraftWorkflowStatus;
  item_state: ItemState;
  bounded: true;
  phase_sequence: FlowcraftPhaseId[];
  loop: FlowcraftExecutionLoopMetadata;
  node_outputs: FlowcraftExecutionNodeOutput[];
  planning_artifacts: FlowcraftPlanningArtifactDraft[];
  planning_session_result: FlowcraftPlanningSessionResult | null;
  planning_run_plan_valid: boolean;
  planning_run_plan_ready: boolean;
  planning_should_fail: boolean;
  planning_failure_reason: string | null;
  recovery_commands: string[];
  terminal_state: {
    state: ItemState;
    reason: string;
  };
  serialized_context: string;
  [key: string]: unknown;
}

export interface FlowcraftPhaseProgressRecord {
  issue_id: string;
  run_id: string;
  execution_id: string;
  workflow_id: FlowcraftWorkflowId;
  workflow_version: string;
  phase: FlowcraftPhaseId;
  state: ItemState;
  event_type: string;
  message: string;
  occurred_at: string;
  recovery_commands: string[];
  serialized_context: string;
  node_output: FlowcraftExecutionNodeOutput;
}

export type FlowcraftPhaseProgressWriter = (
  record: FlowcraftPhaseProgressRecord,
) => FutureInstance<unknown, void>;

export interface FlowcraftExecutionPlan {
  workflow: FlowcraftWorkflowDefinition;
  execution_id: string;
  run_id: string;
  issue_id: string;
  started_at: string;
  finished_at: string;
  transport: TransportCorrelation | null;
  metadata: FlowcraftExecutionMetadata;
  flowcraft_events: Array<{
    flowcraft_event_id: string;
    execution_id: string;
    node_id: FlowcraftNodeId | "workflow";
    type: string;
    occurred_at: string;
    data: Record<string, unknown>;
  }>;
  domain_events: Array<{
    event_id: string;
    issue_id: string | null;
    run_id: string | null;
    type: string;
    state: ItemState;
    message: string;
    severity: "info";
    occurred_at: string;
    actor: string;
    transport: TransportCorrelation | null;
    data: Record<string, unknown>;
  }>;
}

export interface FlowcraftAutobotPlanningDependencies {
  repo: RepoRef;
  item: ItemDetail;
  artifactDrafts: FlowcraftPlanningArtifactDraft[];
  artifactPaths: FlowcraftPlanningSessionArtifactPaths;
  artifactWriter: FlowcraftArtifactWriter;
  artifactReader: FlowcraftArtifactReader;
  planningSessionRunner: FlowcraftPlanningSessionRunner;
  progressWriter?: FlowcraftPhaseProgressWriter;
  progressClock?: () => string;
  planningWorkerStarter?: FlowcraftPlanningWorkerStarter;
}

export interface FlowcraftWorkflowDependencies {
  autobotPlanning?: FlowcraftAutobotPlanningDependencies;
}

export type FlowcraftNodeImplementation = NodeFunction | NodeClass;
