export type KnownTaskState =
  | "queued"
  | "claimed"
  | "running"
  | "reconciling"
  | "failed"
  | "error"
  | "stale"
  | "released"
  | "canceled";

export type TaskState = KnownTaskState | (string & {});

export interface TaskInput {
  issue_identifier?: string;
  identifier?: string;
  claim_state?: string;
  workspace_path?: string;
  claimed_by?: string;
  updated_at?: string;
  attempt_count?: number | string;
  last_observed_issue_state_name?: string;
  last_observed_issue_state_type?: string;
  retry_reason?: string;
  last_error?: string;
  linear_sync_error?: string;
  conditions?: unknown[];
  wait_conditions?: unknown[];
  workspace_exists?: boolean;
  workspace_dirty?: boolean;
  merge_conflict_count?: number | string;
  linear?: unknown;
  pr?: unknown;
  status_state?: string;
  max_attempts?: number | string;
  [key: string]: unknown;
}

export interface QueuePayload {
  items?: unknown[];
  claims?: unknown[];
  config?: Record<string, unknown>;
  schema_version?: number;
  generated_at?: string;
  allow_recovery?: boolean;
  [key: string]: unknown;
}

export interface TaskObservation {
  workspaceExists: boolean;
  workspaceDirty: boolean;
  mergeConflictCount: number;
  linearStateType: string;
  linearStateName: string;
  prState: string;
  mergeStateStatus: string;
  reviewDecision: string;
  statusState: string;
  attemptCount: number;
  maxAttempts: number;
  claimState: TaskState;
}

export type EffectRequest =
  | {
      kind: "prepare";
      issueIdentifier: string;
      phase: "delivery";
      claimedBy: string;
    }
  | {
      kind: "process-work";
      issueIdentifier: string;
      workspacePath: string;
      attemptCount: number;
      phase: "delivery";
    }
  | {
      kind: "recover";
      issueIdentifier: string;
      action:
        | "release"
        | "reconcile"
        | "cancel"
        | "retry"
        | "stop"
        | "continue";
      reason: string;
      fetchMain: boolean;
      cleanupEligible: boolean;
      phase: "delivery";
      attemptCount: number;
    }
  | {
      kind: "noop";
      issueIdentifier: string;
      reason: string;
    };

export type EffectOutcome = "succeeded" | "failed" | "skipped";

export interface EffectResult {
  request: EffectRequest;
  outcome: EffectOutcome;
  message: string;
}

export interface TransitionDecision {
  taskId: string;
  currentState: TaskState;
  nextState: TaskState | null;
  reason: string;
  effects: EffectRequest[];
}

export interface TaskPlan {
  item: TaskInput;
  observation: TaskObservation;
  decision: TransitionDecision;
}

export interface QueueSummary {
  total: number;
  claimed: number;
  running: number;
  reconciling: number;
  recovery: number;
  terminal: number;
  by_state: Record<string, number>;
  selected_issue_identifier: string;
  selected_state: string;
  allow_recovery: boolean;
}

export interface ProcessQueueResult {
  items: TaskPlan[];
  effectResults?: EffectResult[];
  summary: QueueSummary;
  selected_work: TaskInput | null;
  generated_at: string;
}
