import assert from "node:assert/strict";
import test from "node:test";

import { fork, resolve, type FutureInstance } from "fluture";

import type { AutobotStore } from "@repro/autobot-store";

import { createAutobotServices } from "../services";
import type {
  AutobotCommandResult,
  AutobotGlobalOptions,
  AutobotInvocation,
} from "../types";

import { makeWorkflowStore } from "./workflow-fixture";

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

function makeOptions(
  overrides: Partial<AutobotGlobalOptions> = {},
): AutobotGlobalOptions {
  return {
    json: false,
    repo: "/worktrees/autobot",
    state_dir: ".autobot",
    profile: null,
    quiet: false,
    verbose: false,
    color: false,
    dry_run: false,
    force: false,
    project: [],
    labels: [],
    priority: null,
    limit: null,
    ...overrides,
  };
}

function makeInvocation(
  command_path: string[],
  overrides: Partial<AutobotGlobalOptions> = {},
): AutobotInvocation {
  return {
    command_path,
    command: command_path.join(" "),
    args: [],
    options: makeOptions(overrides),
  };
}

function makeQueuedPlanningItem() {
  return {
    issue_id: "REP-1208",
    title: "Bridge OpenCode planning sessions",
    url: "https://linear.app/repro/issue/REP-1208/bridge-opencode-planning-sessions",
    state: "queued" as const,
    attempt: 1,
    priority: 2,
    owner: "Gary",
    workspace: "autobot",
    branch: "autobot/REP-1208",
    queued_at: "2026-05-15T09:00:00Z",
    started_at: null,
    updated_at: "2026-05-15T09:00:00Z",
    last_event: null,
    last_error: null,
    recovery_commands: [],
    linear: null,
    current_run: null,
    cancellation_requested: false,
    cancellation_requested_at: null,
    artifacts: [] as [],
    events: [] as [],
  };
}

const validRunPlan = [
  "## Readiness",
  "ready_to_proceed",
  "",
  "## Sequence Notes",
  "- Implement in one bounded pass.",
  "",
  "## Risk Notes",
  "- No high-risk signals.",
  "",
  "## Plan",
  "- Modify packages/autobot-cli/src/services.ts.",
].join("\n");

const notReadyRunPlan = [
  "## Readiness",
  "not_ready",
  "",
  "## Sequence Notes",
  "- Return to research-refine.",
  "",
  "## Risk Notes",
  "- Scope is not ready.",
  "",
  "## Plan",
  "- Do not implement yet.",
  "",
  "## Open Questions",
  "- Which files are in scope?",
].join("\n");

const emptySequenceNotesRunPlan = [
  "## Readiness",
  "ready_to_proceed",
  "",
  "## Sequence Notes",
  "",
  "## Risk Notes",
  "- Scope is not ready.",
  "",
  "## Plan",
  "- Do not implement yet.",
].join("\n");

test("supervisor run-once passes durable planning artifact paths into opencode", async () => {
  const fixture = makeWorkflowStore({
    items: [makeQueuedPlanningItem()],
  });
  const received: Array<{
    phase: string | undefined;
    artifactPaths: {
      context: string;
      testPlan: string;
      contract: string;
      runPlan: string;
      prompt: string;
    };
  }> = [];
  const reads: Array<{ path: string }> = [];
  const writes: Array<{ path: string; content: string }> = [];
  const services = createAutobotServices({
    artifactWriter(input) {
      writes.push(input);
      return resolve(undefined);
    },
    artifactReader(input) {
      reads.push(input);
      return resolve(validRunPlan);
    },
    planningSessionRunner(input) {
      received.push({ phase: input.phase, artifactPaths: input.artifactPaths });
      return resolve({
        command: "opencode",
        args: ["run"],
        started_at: "2026-05-15T12:00:01Z",
        finished_at: "2026-05-15T12:00:02Z",
        exit_code: 0,
        signal: null,
        stdout: "planner stdout",
        stderr: "planner stderr",
      });
    },
    loadLinearIssue() {
      return resolve({
        issue_id: "REP-1208",
        title: "Bridge OpenCode planning sessions",
        url: "https://linear.app/repro/issue/REP-1208/bridge-opencode-planning-sessions",
        state_name: "Todo",
        state_type: "unstarted",
        project: "Engineering",
        labels: ["backend"],
        assignee: "Gary",
      });
    },
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      return "run-1208";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(reads, [
    {
      path: "/worktrees/autobot/.autobot/runs/REP-1208/attempt-1/run-plan.md",
    },
  ]);
  assert.equal(received.length, 1);
  assert.ok(
    fixture.flowcraftEvents.some(
      (event) => event.type === "workflow.planner.started",
    ),
  );
  assert.ok(
    fixture.flowcraftEvents.some(
      (event) => event.type === "workflow.planner.stdout",
    ),
  );
  assert.ok(
    fixture.flowcraftEvents.some(
      (event) => event.type === "workflow.planner.stderr",
    ),
  );
  assert.ok(
    fixture.flowcraftEvents.some(
      (event) => event.type === "workflow.planner.finished",
    ),
  );
  assert.equal(
    fixture.flowcraftEvents.find(
      (event) => event.type === "workflow.planner.finished",
    )?.occurred_at,
    "2026-05-15T12:00:00Z",
  );
  assert.equal(fixture.executionRecords.length, 1);
  assert.equal(
    fixture.executionRecords[0]?.finished_at,
    "2026-05-15T12:00:02.001Z",
  );
  assert.equal(fixture.flowcraftEvents.length > 0, true);
  assert.equal(fixture.itemUpserts.at(-1)?.state, "completed");
  assert.equal(
    fixture.itemUpserts.at(-1)?.updated_at,
    "2026-05-15T12:00:02.001Z",
  );
});

test("supervisor run-once rejects empty required run-plan sections before flowcraft completion", async () => {
  const fixture = makeWorkflowStore({
    items: [makeQueuedPlanningItem()],
  });
  const reads: Array<{ path: string }> = [];
  const writes: Array<{ path: string; content: string }> = [];
  const services = createAutobotServices({
    artifactWriter(input) {
      writes.push(input);
      return resolve(undefined);
    },
    artifactReader(input) {
      reads.push(input);
      return resolve(emptySequenceNotesRunPlan);
    },
    planningSessionRunner(input) {
      void input;
      return resolve({
        command: "opencode",
        args: ["run"],
        started_at: "2026-05-15T12:00:01Z",
        finished_at: "2026-05-15T12:00:02Z",
        exit_code: 0,
        signal: null,
        stdout: "planner stdout",
        stderr: "planner stderr",
      });
    },
    loadLinearIssue() {
      return resolve({
        issue_id: "REP-1208",
        title: "Bridge OpenCode planning sessions",
        url: "https://linear.app/repro/issue/REP-1208/bridge-opencode-planning-sessions",
        state_name: "Todo",
        state_type: "unstarted",
        project: "Engineering",
        labels: ["backend"],
        assignee: "Gary",
      });
    },
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      return "run-1208";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.ok(writes.length >= 4);
  assert.deepEqual(reads, [
    {
      path: "/worktrees/autobot/.autobot/runs/REP-1208/attempt-1/run-plan.md",
    },
  ]);
  assert.equal(
    writes.some((write) => write.path.endsWith("/run-plan.md")),
    false,
  );
  assert.equal(fixture.executionRecords.length, 1);
  assert.ok(fixture.flowcraftEvents.length > 0);
  assert.equal(fixture.itemUpserts.at(-1)?.state, "failed");
  assert.equal(
    (fixture.itemUpserts.at(-1)?.last_error as { code?: string } | null)?.code,
    "AUTOBOT-PLANNER-RUN-PLAN-INVALID",
  );
});

test("supervisor run-once preserves non-ready run plans without flowcraft completion", async () => {
  const fixture = makeWorkflowStore({
    items: [makeQueuedPlanningItem()],
  });
  const reads: Array<{ path: string }> = [];
  const writes: Array<{ path: string; content: string }> = [];
  const services = createAutobotServices({
    artifactWriter(input) {
      writes.push(input);
      return resolve(undefined);
    },
    artifactReader(input) {
      reads.push(input);
      return resolve(notReadyRunPlan);
    },
    planningSessionRunner(input) {
      void input;
      return resolve({
        command: "opencode",
        args: ["run"],
        started_at: "2026-05-15T12:00:01Z",
        finished_at: "2026-05-15T12:00:02Z",
        exit_code: 0,
        signal: null,
        stdout: "planner stdout",
        stderr: "planner stderr",
      });
    },
    loadLinearIssue() {
      return resolve({
        issue_id: "REP-1208",
        title: "Bridge OpenCode planning sessions",
        url: "https://linear.app/repro/issue/REP-1208/bridge-opencode-planning-sessions",
        state_name: "Todo",
        state_type: "unstarted",
        project: "Engineering",
        labels: ["backend"],
        assignee: "Gary",
      });
    },
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      return "run-1208";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.ok(writes.length >= 4);
  assert.deepEqual(reads, [
    {
      path: "/worktrees/autobot/.autobot/runs/REP-1208/attempt-1/run-plan.md",
    },
  ]);
  assert.equal(
    writes.some((write) => write.path.endsWith("/run-plan.md")),
    false,
  );
  assert.equal(fixture.executionRecords.length, 1);
  assert.ok(fixture.flowcraftEvents.length > 0);
  assert.equal(fixture.runUpserts.at(-1)?.state, "awaiting");
  assert.equal(fixture.itemUpserts.at(-1)?.state, "awaiting");
  assert.equal(
    (fixture.itemUpserts.at(-1)?.last_error as { code?: string } | null)?.code,
    "AUTOBOT-PLANNER-RUN-PLAN-NOT-READY",
  );
});

test("supervisor run-once records planner failure without flowcraft completion", async () => {
  const fixture = makeWorkflowStore({
    items: [makeQueuedPlanningItem()],
  });
  const services = createAutobotServices({
    artifactWriter() {
      return resolve(undefined);
    },
    planningSessionRunner(input) {
      void input;
      return resolve({
        command: "opencode",
        args: ["run"],
        started_at: "2026-05-15T12:00:01Z",
        finished_at: "2026-05-15T12:00:02Z",
        exit_code: 1,
        signal: null,
        stdout: "planner stdout",
        stderr: "planner stderr",
      });
    },
    loadLinearIssue() {
      return resolve({
        issue_id: "REP-1208",
        title: "Bridge OpenCode planning sessions",
        url: "https://linear.app/repro/issue/REP-1208/bridge-opencode-planning-sessions",
        state_name: "Todo",
        state_type: "unstarted",
        project: "Engineering",
        labels: ["backend"],
        assignee: "Gary",
      });
    },
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      return "run-1208";
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.equal(fixture.executionRecords.length, 1);
  assert.ok(fixture.flowcraftEvents.length > 0);
  assert.ok(
    fixture.flowcraftEvents.some(
      (event) => event.type === "workflow.planner.finished",
    ),
  );
  assert.equal(fixture.itemUpserts.at(-1)?.state, "failed");
  assert.equal(
    (fixture.itemUpserts.at(-1)?.last_error as { code?: string } | null)?.code,
    "AUTOBOT-PLANNER-RUN-PLAN-INVALID",
  );
});
