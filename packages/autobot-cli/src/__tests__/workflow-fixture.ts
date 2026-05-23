import { resolve, type FutureInstance } from "fluture";

import type { TransportCorrelation } from "@repro/autobot-core";
import type { ArtifactRecord, AutobotStore } from "@repro/autobot-store";

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

type WorkflowItemState =
  | "queued"
  | "claimed"
  | "awaiting"
  | "failed"
  | "escalated"
  | "completed"
  | "canceled";

type WorkflowItemRecord = {
  issue_id: string;
  title: string;
  url: string;
  state: WorkflowItemState;
  attempt: number;
  priority: number;
  owner: string;
  workspace: string;
  branch: string;
  queued_at: string;
  started_at: string | null;
  updated_at: string;
  last_event: string | null;
  last_error: null;
  recovery_commands: string[];
  linear: null;
  current_run: null;
  cancellation_requested: boolean;
  cancellation_requested_at: string | null;
  artifacts: [];
  events: [];
};

type WorkflowRunRecord = {
  run_id: string;
  issue_id: string;
  attempt: number;
  state: WorkflowItemState;
  flowcraft_execution_id: string | null;
  blueprint_id: string;
  blueprint_version: string;
  started_at: string;
  finished_at: string | null;
  worker_id: string | null;
  last_heartbeat_at: string | null;
  transport: TransportCorrelation | null;
};

type WorkflowWorkerRecord = {
  worker_id: string;
  issue_id: string | null;
  run_id: string | null;
  flowcraft_execution_id?: string | null;
  workflow_node_id?: string | null;
  phase?: string | null;
  state:
    | "starting"
    | "running"
    | "completed"
    | "failed"
    | "canceled"
    | "stale"
    | "cancellation-requested"
    | "exited";
  pid: number | null;
  child_pid?: number | null;
  process_group_id?: number | null;
  command?: string | null;
  args?: string[];
  started_at: string;
  last_heartbeat_at: string | null;
  deadline_at?: string | null;
  stdout_log_path?: string | null;
  stderr_log_path?: string | null;
  result?: Record<string, unknown> | null;
  result_artifact_path?: string | null;
  exit_code?: number | null;
  signal?: string | null;
  finished_at?: string | null;
};

type WorkflowStoreOptions = {
  items?: WorkflowItemRecord[];
  configOverrides?: Partial<Record<string, string | number | boolean>>;
  currentRuns?: Partial<Record<string, WorkflowRunRecord | null>>;
  workers?: WorkflowWorkerRecord[];
  artifacts?: Partial<Record<string, ArtifactRecord[]>>;
};

function createItemRecord(input: WorkflowItemRecord): WorkflowItemRecord {
  return { ...input };
}

function createDefaultWorkflowItems(): WorkflowItemRecord[] {
  return [
    createItemRecord({
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
    }),
    createItemRecord({
      issue_id: "REP-1155",
      title: "Track queued engine passes",
      url: "https://linear.app/repro/issue/REP-1155/track-queued-engine-passes",
      state: "claimed",
      attempt: 1,
      priority: 3,
      owner: "Gary",
      workspace: "autobot",
      branch: "autobot/REP-1155",
      queued_at: "2026-05-15T10:50:00Z",
      started_at: "2026-05-15T10:55:00Z",
      updated_at: "2026-05-15T10:55:00Z",
      last_event: null,
      last_error: null,
      recovery_commands: [],
      linear: null,
      current_run: null,
      cancellation_requested: false,
      cancellation_requested_at: null,
      artifacts: [],
      events: [],
    }),
    createItemRecord({
      issue_id: "REP-1156",
      title: "Record full queue ticks",
      url: "https://linear.app/repro/issue/REP-1156/record-full-queue-ticks",
      state: "failed",
      attempt: 2,
      priority: 1,
      owner: "Gary",
      workspace: "autobot",
      branch: "autobot/REP-1156",
      queued_at: "2026-05-15T10:40:00Z",
      started_at: "2026-05-15T10:45:00Z",
      updated_at: "2026-05-15T10:45:00Z",
      last_event: null,
      last_error: null,
      recovery_commands: [],
      linear: null,
      current_run: null,
      cancellation_requested: false,
      cancellation_requested_at: null,
      artifacts: [],
      events: [],
    }),
  ];
}

export function makeWorkflowStore(options: WorkflowStoreOptions = {}) {
  const runUpserts: Array<Record<string, unknown>> = [];
  const executionRecords: Array<Record<string, unknown>> = [];
  const flowcraftEvents: Array<Record<string, unknown>> = [];
  const domainEvents: Array<Record<string, unknown>> = [];
  const artifactRecords: Array<Record<string, unknown>> = [];
  const artifactLookups: string[] = [];
  const itemUpserts: Array<Record<string, unknown>> = [];
  const runGetLookups: string[] = [];
  const flowcraftGetLookups: string[] = [];
  const domainEventLookups: Array<{
    issueId: string | undefined;
    options: Record<string, unknown> | undefined;
  }> = [];
  const overrideRecords = Object.entries(options.configOverrides ?? {}).map(
    ([key, value]) => ({
      key,
      value,
      value_type:
        typeof value === "number"
          ? "integer"
          : typeof value === "boolean"
          ? "boolean"
          : "string",
      source: "repo" as const,
      updated_at: "2026-05-15T00:00:00Z",
    }),
  );
  let transactionCalls = 0;
  const itemRecords = (options.items ?? createDefaultWorkflowItems()).map(
    createItemRecord,
  );
  const workerRecords = [...(options.workers ?? [])].map((worker) => ({
    ...worker,
  }));
  const currentWorkerStates = new Set([
    "starting",
    "running",
    "stale",
    "cancellation-requested",
  ]);
  const terminalWorkerStates = new Set([
    "completed",
    "failed",
    "canceled",
    "exited",
  ]);
  const upsertWorker = (input: Record<string, unknown>) => {
    const next = { ...input } as (typeof workerRecords)[number];
    const index = workerRecords.findIndex(
      (worker) => worker.worker_id === next.worker_id,
    );

    if (index === -1) {
      workerRecords.push(next);
    } else {
      workerRecords[index] = next;
    }

    return next;
  };
  const currentRuns = new Map(
    Object.entries(options.currentRuns ?? {}).map(
      ([issueId, run]) => [issueId, run] as const,
    ),
  );
  const artifactsByIssue = new Map(
    Object.entries(options.artifacts ?? {}).map(
      ([issueId, artifacts]) => [issueId, [...(artifacts ?? [])]] as const,
    ),
  );

  const findItem = (issueId: string) =>
    itemRecords.find((item) => item.issue_id === issueId) ?? null;

  const findCurrentRun = (issueId: string) => currentRuns.get(issueId) ?? null;

  const resolveCurrentWorker = (issueId: string) => {
    const currentRun = findCurrentRun(issueId);
    const lookupPredicates: Array<
      (worker: (typeof workerRecords)[number]) => boolean
    > = [];

    if (currentRun?.worker_id != null) {
      lookupPredicates.push(
        (worker) => worker.worker_id === currentRun.worker_id,
      );
    }

    if (currentRun?.flowcraft_execution_id != null) {
      lookupPredicates.push(
        (worker) =>
          worker.flowcraft_execution_id === currentRun.flowcraft_execution_id,
      );
    }

    if (currentRun !== null) {
      lookupPredicates.push((worker) => worker.run_id === currentRun.run_id);
    }

    lookupPredicates.push((worker) => worker.issue_id === issueId);

    for (const predicate of lookupPredicates) {
      const currentWorker = [...workerRecords]
        .filter((worker) => predicate(worker))
        .filter((worker) => currentWorkerStates.has(worker.state))
        .sort((left, right) =>
          right.started_at.localeCompare(left.started_at),
        )[0];

      if (currentWorker !== undefined) {
        return currentWorker;
      }
    }

    return null;
  };

  const upsertItem = (input: Record<string, unknown>) => {
    const issueId = input.issue_id as string | undefined;
    if (issueId === undefined) {
      itemUpserts.push(input);
      return input;
    }

    const current = findItem(issueId);
    const next = current === null ? { ...input } : { ...current, ...input };
    const index = itemRecords.findIndex((item) => item.issue_id === issueId);

    if (index === -1) {
      itemRecords.push(next as (typeof itemRecords)[number]);
    } else {
      itemRecords[index] = next as (typeof itemRecords)[number];
    }

    itemUpserts.push(input);
    return next;
  };

  const store = {
    repo: {
      path: "/worktrees/autobot",
      state_dir: ".autobot",
    },
    close() {
      return resolve(undefined);
    },
    transaction(
      handler: (store: AutobotStore) => FutureInstance<unknown, unknown>,
    ) {
      transactionCalls += 1;
      return handler(store as unknown as AutobotStore);
    },
    items: {
      get(issueId: string) {
        const item = findItem(issueId);
        return resolve(item === null ? null : { ...item });
      },
      upsert(input: Record<string, unknown>) {
        return resolve(upsertItem(input) as Record<string, unknown>);
      },
    },
    projections: {
      listItems(input?: { include_terminal?: boolean }) {
        const visibleItems =
          input?.include_terminal === true
            ? itemRecords
            : itemRecords.filter(
                (item) =>
                  item.state !== "escalated" &&
                  item.state !== "completed" &&
                  item.state !== "canceled",
              );

        return resolve(
          [...visibleItems].sort((left, right) =>
            right.updated_at.localeCompare(left.updated_at),
          ),
        );
      },
      getNextRunnableItem() {
        throw new Error(
          "getNextRunnableItem should not be used for engine run-once",
        );
      },
      getItemDetail(issueId: string) {
        const item = findItem(issueId);
        const currentRun = findCurrentRun(issueId);
        const currentWorker = resolveCurrentWorker(issueId);
        return resolve(
          item === null
            ? null
            : {
                ...item,
                current_run: currentRun === null ? null : { ...currentRun },
                current_worker:
                  currentWorker === null
                    ? null
                    : { ...currentWorker, transport: null },
                artifacts: [...(artifactsByIssue.get(issueId) ?? [])],
              },
        );
      },
    },
    config: {
      setOverride() {
        return resolve(undefined);
      },
      getOverride(key: string) {
        return resolve(
          overrideRecords.find((override) => override.key === key) ?? null,
        );
      },
      listOverrides() {
        return resolve(overrideRecords);
      },
      deleteOverride() {
        return resolve(undefined);
      },
    },
    events: {
      append(input: Record<string, unknown>) {
        domainEvents.push(input);
        return resolve(input);
      },
      list(issueId?: string, options?: Record<string, unknown>) {
        domainEventLookups.push({ issueId, options });
        return resolve([
          issueId === "REP-1156"
            ? {
                event_id: "domain-event-3",
                issue_id: "REP-1156",
                run_id: null,
                type: "workflow.phase.claimed",
                state: "claimed",
                message: "Issue claimed",
                severity: "info",
                occurred_at: "2026-05-15T11:20:00Z",
                actor: "autobot-flowcraft",
                transport: null,
                data: {},
              }
            : issueId === "REP-1155"
            ? {
                event_id: "domain-event-2",
                issue_id: "REP-1155",
                run_id: "run-1155",
                type: "workflow.phase.claimed",
                state: "claimed",
                message: "Issue claimed",
                severity: "info",
                occurred_at: "2026-05-15T11:10:00Z",
                actor: "autobot-flowcraft",
                transport: null,
                data: {},
              }
            : {
                event_id: "domain-event-1",
                issue_id: "REP-1154",
                run_id: "run-1154",
                type: "workflow.phase.claimed",
                state: "claimed",
                message: "Issue claimed",
                severity: "info",
                occurred_at: "2026-05-15T11:00:00Z",
                actor: "autobot-flowcraft",
                transport: null,
                data: {},
              },
        ]);
      },
    },
    runs: {
      upsert(input: Record<string, unknown>) {
        runUpserts.push(input);
        const issueId = input.issue_id as string | undefined;
        if (issueId !== undefined) {
          currentRuns.set(issueId, {
            run_id: input.run_id as string,
            issue_id: issueId,
            attempt: input.attempt as number,
            state: input.state as WorkflowItemState,
            flowcraft_execution_id:
              (input.flowcraft_execution_id as string | null) ?? null,
            blueprint_id: input.blueprint_id as string,
            blueprint_version: input.blueprint_version as string,
            started_at: input.started_at as string,
            finished_at: (input.finished_at as string | null) ?? null,
            worker_id: (input.worker_id as string | null) ?? null,
            last_heartbeat_at:
              (input.last_heartbeat_at as string | null) ?? null,
            transport: null,
          });
        }
        return resolve({
          run_id: input.run_id,
          issue_id: input.issue_id,
          attempt: input.attempt,
          state: input.state,
          flowcraft_execution_id: input.flowcraft_execution_id,
          blueprint_id: input.blueprint_id,
          blueprint_version: input.blueprint_version,
          started_at: input.started_at,
          finished_at: input.finished_at,
          worker_id: input.worker_id,
          last_heartbeat_at: input.last_heartbeat_at,
          transport: input.transport,
        });
      },
      get(runId: string) {
        runGetLookups.push(runId);
        const currentRun = [...currentRuns.values()].find(
          (run): run is WorkflowRunRecord =>
            run !== null && run !== undefined && run.run_id === runId,
        );

        if (currentRun !== undefined) {
          return resolve({ ...currentRun });
        }

        return resolve(
          runId === "run-1154"
            ? {
                run_id: "run-1154",
                issue_id: "REP-1154",
                attempt: 1,
                state: "claimed",
                flowcraft_execution_id: "exec-1154",
                blueprint_id: "autobot-deliver-issue",
                blueprint_version: "1.0.0",
                started_at: "2026-05-15T11:00:00Z",
                finished_at: null,
                worker_id: null,
                last_heartbeat_at: null,
                transport: null,
              }
            : runId === "run-1156"
            ? {
                run_id: "run-1156",
                issue_id: "REP-1156",
                attempt: 1,
                state: "claimed",
                flowcraft_execution_id: null,
                blueprint_id: "autobot-deliver-issue",
                blueprint_version: "1.0.0",
                started_at: "2026-05-15T11:20:00Z",
                finished_at: null,
                worker_id: null,
                last_heartbeat_at: null,
                transport: null,
              }
            : runId === "run-1155"
            ? {
                run_id: "run-1155",
                issue_id: "REP-1155",
                attempt: 1,
                state: "claimed",
                flowcraft_execution_id: null,
                blueprint_id: "autobot-deliver-issue",
                blueprint_version: "1.0.0",
                started_at: "2026-05-15T11:10:00Z",
                finished_at: null,
                worker_id: null,
                last_heartbeat_at: null,
                transport: null,
              }
            : null,
        );
      },
      getCurrent(issueId: string) {
        return resolve(findCurrentRun(issueId));
      },
    },
    workers: {
      create(input: Record<string, unknown>) {
        return resolve(upsertWorker(input));
      },
      update(input: Record<string, unknown>) {
        return resolve(upsertWorker(input));
      },
      upsert(input: Record<string, unknown>) {
        return resolve(upsertWorker(input));
      },
      get(workerId: string) {
        return resolve(
          workerRecords.find((worker) => worker.worker_id === workerId) ?? null,
        );
      },
      list(input?: { includeTerminal?: boolean }) {
        const visibleWorkers =
          input?.includeTerminal === false
            ? workerRecords.filter(
                (worker) => !terminalWorkerStates.has(worker.state),
              )
            : workerRecords;

        return resolve(
          [...visibleWorkers].sort((left, right) =>
            right.started_at.localeCompare(left.started_at),
          ),
        );
      },
      resolveCurrentByRun(runId: string) {
        return resolve(
          [...workerRecords]
            .filter(
              (worker) =>
                worker.run_id === runId &&
                currentWorkerStates.has(worker.state),
            )
            .sort((left, right) =>
              right.started_at.localeCompare(left.started_at),
            )[0] ?? null,
        );
      },
      resolveCurrentByIssue(issueId: string) {
        return resolve(
          [...workerRecords]
            .filter(
              (worker) =>
                worker.issue_id === issueId &&
                currentWorkerStates.has(worker.state),
            )
            .sort((left, right) =>
              right.started_at.localeCompare(left.started_at),
            )[0] ?? null,
        );
      },
      resolveCurrentByFlowcraftExecution(executionId: string) {
        return resolve(
          [...workerRecords]
            .filter(
              (worker) =>
                worker.flowcraft_execution_id === executionId &&
                currentWorkerStates.has(worker.state),
            )
            .sort((left, right) =>
              right.started_at.localeCompare(left.started_at),
            )[0] ?? null,
        );
      },
    },
    artifacts: {
      record(input: Record<string, unknown>) {
        artifactRecords.push(input);
        return resolve(input);
      },
      list(issueId: string) {
        artifactLookups.push(issueId);
        return resolve([...(artifactsByIssue.get(issueId) ?? [])]);
      },
    },
    flowcraft: {
      recordExecution(input: Record<string, unknown>) {
        executionRecords.push(input);
        return resolve({
          execution_id: input.execution_id,
          issue_id: input.issue_id,
          run_id: input.run_id,
          state: input.state,
          started_at: input.started_at,
          finished_at: input.finished_at,
          metadata: input.metadata,
        });
      },
      getExecution(executionId: string) {
        flowcraftGetLookups.push(executionId);
        return resolve(
          executionId === "exec-1154"
            ? {
                execution_id: "exec-1154",
                issue_id: "REP-1154",
                run_id: "run-1154",
                state: "completed",
                started_at: "2026-05-15T11:00:00Z",
                finished_at: "2026-05-15T11:00:01Z",
                metadata: {
                  workflow_id: "autobot-deliver-issue",
                  workflow_version: "1.0.0",
                  bounded: true,
                  workflow_status: "completed",
                  item_state: "completed",
                  planning_artifacts: [
                    {
                      kind: "context",
                      path: ".autobot/runs/run-1154/attempt-1/context.md",
                      description: "Planning context",
                      content_hash: "hash-context",
                      persist: true,
                    },
                    {
                      kind: "test-plan",
                      path: ".autobot/runs/run-1154/attempt-1/test-plan.md",
                      description: "Planning test plan",
                      content_hash: "hash-test-plan",
                      persist: true,
                    },
                    {
                      kind: "run-plan",
                      path: ".autobot/runs/run-1154/attempt-1/run-plan.md",
                      description: "Planning run plan",
                      content_hash: "hash-run-plan",
                      persist: true,
                    },
                  ],
                  planning_session_result: {
                    command: "opencode",
                    args: ["run"],
                    started_at: "2026-05-15T11:00:00Z",
                    finished_at: "2026-05-15T11:00:01Z",
                    exit_code: 0,
                    signal: null,
                    stdout: "",
                    stderr: "",
                  },
                  planning_run_plan_valid: true,
                  planning_run_plan_ready: true,
                  planning_should_fail: false,
                  planning_failure_reason: null,
                  loop: {
                    id: "review-loop",
                    attempt_limit: 3,
                    attempts: 1,
                    exhausted: false,
                    continued: false,
                    body: ["developing", "testing", "reviewing", "review-fix"],
                  },
                  phase_sequence: [
                    "claim",
                    "preparing",
                    "planning",
                    "developing",
                    "testing",
                    "reviewing",
                    "review-fix",
                    "reconcile",
                    "complete",
                  ],
                  node_outputs: [
                    {
                      node_id: "claim",
                      state: "claimed",
                      output: { phase: "claim", state: "claimed" },
                      occurred_at: "2026-05-15T11:00:00Z",
                    },
                    {
                      node_id: "preparing",
                      state: "preparing",
                      output: { phase: "preparing", state: "preparing" },
                      occurred_at: "2026-05-15T11:00:00Z",
                    },
                    {
                      node_id: "planning",
                      state: "planning",
                      output: { phase: "planning", state: "planning" },
                      occurred_at: "2026-05-15T11:00:00Z",
                    },
                    {
                      node_id: "developing",
                      state: "developing",
                      output: { phase: "developing", state: "developing" },
                      occurred_at: "2026-05-15T11:00:00Z",
                    },
                    {
                      node_id: "testing",
                      state: "testing",
                      output: { phase: "testing", state: "testing" },
                      occurred_at: "2026-05-15T11:00:00Z",
                    },
                    {
                      node_id: "reviewing",
                      state: "reviewing",
                      output: { phase: "reviewing", state: "reviewing" },
                      occurred_at: "2026-05-15T11:00:00Z",
                    },
                    {
                      node_id: "review_fix",
                      state: "reviewing",
                      output: { phase: "review-fix", state: "reviewing" },
                      occurred_at: "2026-05-15T11:00:00Z",
                    },
                    {
                      node_id: "review-loop",
                      state: "reviewing",
                      output: null,
                      occurred_at: "2026-05-15T11:00:00Z",
                    },
                    {
                      node_id: "reconcile",
                      state: "reconciling",
                      output: { phase: "reconcile", state: "reconciling" },
                      occurred_at: "2026-05-15T11:00:00Z",
                    },
                    {
                      node_id: "complete",
                      state: "completed",
                      output: { phase: "complete", state: "completed" },
                      occurred_at: "2026-05-15T11:00:01Z",
                    },
                  ],
                  serialized_context:
                    '{"issue_id":"REP-1154","run_id":"run-1154","execution_id":"exec-1154","review_continue":false,"review_should_reconcile":true,"review_should_escalate":false,"_outputs.complete":{"phase":"complete","state":"completed"}}',
                },
              }
            : executionId === "flowcraft-exec-1156"
            ? {
                execution_id: "flowcraft-exec-1156",
                issue_id: "REP-1156",
                run_id: null,
                state: "completed",
                started_at: "2026-05-15T11:20:00Z",
                finished_at: "2026-05-15T11:20:01Z",
                metadata: {
                  workflow_id: "autobot-deliver-issue",
                  workflow_version: "1.0.0",
                  bounded: true,
                  workflow_status: "completed",
                  item_state: "completed",
                  loop: {
                    id: "review-loop",
                    attempt_limit: 3,
                    attempts: 1,
                    exhausted: false,
                    continued: false,
                    body: ["developing", "testing", "reviewing", "review-fix"],
                  },
                  phase_sequence: [
                    "claim",
                    "preparing",
                    "planning",
                    "developing",
                    "testing",
                    "reviewing",
                    "review-fix",
                    "reconcile",
                    "complete",
                  ],
                  node_outputs: [
                    {
                      node_id: "claim",
                      state: "claimed",
                      output: { phase: "claim", state: "claimed" },
                      occurred_at: "2026-05-15T11:20:00Z",
                    },
                    {
                      node_id: "preparing",
                      state: "preparing",
                      output: { phase: "preparing", state: "preparing" },
                      occurred_at: "2026-05-15T11:20:00Z",
                    },
                    {
                      node_id: "planning",
                      state: "planning",
                      output: { phase: "planning", state: "planning" },
                      occurred_at: "2026-05-15T11:20:00Z",
                    },
                    {
                      node_id: "developing",
                      state: "developing",
                      output: { phase: "developing", state: "developing" },
                      occurred_at: "2026-05-15T11:20:00Z",
                    },
                    {
                      node_id: "testing",
                      state: "testing",
                      output: { phase: "testing", state: "testing" },
                      occurred_at: "2026-05-15T11:20:00Z",
                    },
                    {
                      node_id: "reviewing",
                      state: "reviewing",
                      output: { phase: "reviewing", state: "reviewing" },
                      occurred_at: "2026-05-15T11:20:00Z",
                    },
                    {
                      node_id: "review_fix",
                      state: "reviewing",
                      output: { phase: "review-fix", state: "reviewing" },
                      occurred_at: "2026-05-15T11:20:00Z",
                    },
                    {
                      node_id: "review-loop",
                      state: "reviewing",
                      output: null,
                      occurred_at: "2026-05-15T11:20:00Z",
                    },
                    {
                      node_id: "reconcile",
                      state: "reconciling",
                      output: { phase: "reconcile", state: "reconciling" },
                      occurred_at: "2026-05-15T11:20:00Z",
                    },
                    {
                      node_id: "complete",
                      state: "completed",
                      output: { phase: "complete", state: "completed" },
                      occurred_at: "2026-05-15T11:20:01Z",
                    },
                  ],
                  serialized_context:
                    '{"issue_id":"REP-1156","run_id":null,"execution_id":"flowcraft-exec-1156","review_continue":false,"review_should_reconcile":true,"review_should_escalate":false,"_outputs.complete":{"phase":"complete","state":"completed"}}',
                },
              }
            : null,
        );
      },
      listExecutions() {
        return resolve([]);
      },
      recordEvent(input: Record<string, unknown>) {
        flowcraftEvents.push(input);
        return resolve(input);
      },
      listEvents(executionId: string) {
        return resolve(
          executionId === "exec-1154"
            ? [
                {
                  flowcraft_event_id: "flowcraft-event-1",
                  execution_id: "exec-1154",
                  node_id: "workflow",
                  type: "workflow:start",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: {},
                },
                {
                  flowcraft_event_id: "flowcraft-event-2",
                  execution_id: "exec-1154",
                  node_id: "workflow",
                  type: "workflow:resume",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: {},
                },
                {
                  flowcraft_event_id: "flowcraft-event-3",
                  execution_id: "exec-1154",
                  node_id: "claim",
                  type: "node:finish",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: { status: "claimed" },
                },
                {
                  flowcraft_event_id: "flowcraft-event-4",
                  execution_id: "exec-1154",
                  node_id: "preparing",
                  type: "node:finish",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: { status: "preparing" },
                },
                {
                  flowcraft_event_id: "flowcraft-event-5",
                  execution_id: "exec-1154",
                  node_id: "planning",
                  type: "node:finish",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: { status: "planning" },
                },
                {
                  flowcraft_event_id: "flowcraft-event-6",
                  execution_id: "exec-1154",
                  node_id: "developing",
                  type: "node:finish",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: { status: "developing" },
                },
                {
                  flowcraft_event_id: "flowcraft-event-7",
                  execution_id: "exec-1154",
                  node_id: "testing",
                  type: "node:finish",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: { status: "testing" },
                },
                {
                  flowcraft_event_id: "flowcraft-event-8",
                  execution_id: "exec-1154",
                  node_id: "reviewing",
                  type: "node:finish",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: { status: "reviewing" },
                },
                {
                  flowcraft_event_id: "flowcraft-event-9",
                  execution_id: "exec-1154",
                  node_id: "review_fix",
                  type: "node:finish",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: { status: "reviewing" },
                },
                {
                  flowcraft_event_id: "flowcraft-event-10",
                  execution_id: "exec-1154",
                  node_id: "review-loop",
                  type: "node:finish",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: { status: "reviewing" },
                },
                {
                  flowcraft_event_id: "flowcraft-event-11",
                  execution_id: "exec-1154",
                  node_id: "reconcile",
                  type: "node:finish",
                  occurred_at: "2026-05-15T11:00:00Z",
                  data: { status: "reconciling" },
                },
                {
                  flowcraft_event_id: "flowcraft-event-12",
                  execution_id: "exec-1154",
                  node_id: "complete",
                  type: "node:finish",
                  occurred_at: "2026-05-15T11:00:01Z",
                  data: { status: "completed" },
                },
                {
                  flowcraft_event_id: "flowcraft-event-13",
                  execution_id: "exec-1154",
                  node_id: "workflow",
                  type: "workflow:finish",
                  occurred_at: "2026-05-15T11:00:01Z",
                  data: { status: "completed" },
                },
              ]
            : [],
        );
      },
    },
  };

  return {
    store: store as unknown as Mutable<typeof store>,
    runUpserts,
    executionRecords,
    flowcraftEvents,
    domainEvents,
    artifactRecords,
    artifactLookups,
    itemUpserts,
    runGetLookups,
    flowcraftGetLookups,
    domainEventLookups,
    get transactionCalls() {
      return transactionCalls;
    },
  };
}
