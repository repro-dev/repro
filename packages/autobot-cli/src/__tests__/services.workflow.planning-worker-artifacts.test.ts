import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import type { AutobotStore } from "@repro/autobot-store";
import { fork, Future, resolve, type FutureInstance } from "fluture";

import { createAutobotServices } from "../services";
import type { AutobotGlobalOptions, AutobotInvocation } from "../types";
import { makeWorkflowStore } from "./workflow-fixture";

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

function makeInvocation(command_path: string[]): AutobotInvocation {
  const options: AutobotGlobalOptions = {
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
  };

  return {
    command_path,
    command: command_path.join(" "),
    args: [],
    options,
  };
}

function queuedItem(issueId: string, queuedAt: string) {
  return {
    issue_id: issueId,
    title: `Queued ${issueId}`,
    url: `https://linear.app/repro/issue/${issueId}/queued`,
    state: "planning" as const,
    attempt: 1,
    priority: 2,
    owner: "Gary",
    workspace: `/worktrees/autobot/.autobot/worktrees/${issueId}`,
    branch: `autobot/${issueId}`,
    queued_at: queuedAt,
    started_at: "2026-05-15T12:00:00Z",
    updated_at: "2026-05-15T12:00:00Z",
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

function firstTickQueuedItem(issueId: string, queuedAt: string) {
  return {
    ...queuedItem(issueId, queuedAt),
    state: "queued" as const,
    workspace: "autobot",
    started_at: null,
    updated_at: queuedAt,
  };
}

const validRunPlan = [
  "## Readiness",
  "ready_to_proceed",
  "",
  "## Sequence Notes",
  "- Continue from the completed planning worker.",
  "",
  "## Risk Notes",
  "- No high-risk signals.",
  "",
  "## Plan",
  "- Deliver the issue.",
].join("\n");

test("completed async planning worker reads run-plan from prepared worktree", async () => {
  const issueId = "REP-117";
  const preparedWorktree = `/worktrees/autobot/.autobot/worktrees/${issueId}`;
  const readPaths: string[] = [];
  const fixture = makeWorkflowStore({
    items: [queuedItem(issueId, "2026-05-15T09:00:00Z")],
    currentRuns: {
      [issueId]: {
        run_id: "run-117",
        issue_id: issueId,
        attempt: 1,
        state: "planning",
        flowcraft_execution_id: "flowcraft-run-117",
        blueprint_id: "autobot-deliver-issue",
        blueprint_version: "1.0.0",
        started_at: "2026-05-15T12:00:00Z",
        finished_at: null,
        worker_id: "worker-run-117",
        last_heartbeat_at: "2026-05-15T12:00:01Z",
        transport: null,
      },
    },
    workers: [
      {
        worker_id: "worker-run-117",
        issue_id: issueId,
        run_id: "run-117",
        flowcraft_execution_id: "flowcraft-run-117",
        workflow_node_id: "plan",
        phase: "plan",
        state: "completed",
        pid: 123,
        started_at: "2026-05-15T12:00:00Z",
        last_heartbeat_at: "2026-05-15T12:00:02Z",
        exit_code: 0,
        signal: null,
        finished_at: "2026-05-15T12:00:02Z",
        result: {
          command: "opencode",
          args: ["run"],
          started_at: "2026-05-15T12:00:00Z",
          finished_at: "2026-05-15T12:00:02Z",
          exit_code: 0,
          signal: null,
          stdout: validRunPlan,
          stderr: "",
        },
      },
    ],
  });
  const services = createAutobotServices({
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:03Z",
    artifactWriter: () => resolve(undefined),
    artifactReader: (input) => {
      readPaths.push(input.path);
      return resolve(validRunPlan);
    },
    isProcessAlive: () => false,
  });

  await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  assert.equal(
    readPaths.includes(
      `${preparedWorktree}/.autobot/runs/${issueId}/attempt-1/run-plan.md`,
    ),
    true,
  );
  assert.equal(fixture.itemUpserts.at(-1)?.state, "completed");
});

test("first tick prepares issue attempt directory before planning artifact writes", async () => {
  const issueId = "REP-417";
  const repoRoot = path.resolve(__dirname, "../../../..");
  const tempRoot = await mkdtemp(
    path.join(repoRoot, "tmp", "autobot-planning-artifacts-"),
  );
  const preparedWorktree = path.join(
    tempRoot,
    ".autobot",
    "worktrees",
    issueId,
  );

  await mkdir(preparedWorktree, { recursive: true });

  const fixture = makeWorkflowStore({
    items: [firstTickQueuedItem(issueId, "2026-05-15T09:00:00Z")],
  });
  const writtenPaths: string[] = [];
  const startedWorkers: string[] = [];
  const services = createAutobotServices({
    prepareWorktree: () =>
      resolve({
        issue_id: issueId,
        branch: `autobot/${issueId}`,
        slug: issueId,
        worktree_path: preparedWorktree,
        archived_worktree_path: null,
      }),
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:00Z",
    randomId: () => "run-first-tick",
    loadLinearIssue: () => resolve(null),
    artifactWriter: (input) =>
      Future((rejectPromise, resolvePromise) => {
        void stat(path.dirname(input.path))
          .then(() => writeFile(input.path, input.content, "utf8"))
          .then(() => {
            writtenPaths.push(input.path);
            resolvePromise();
          }, rejectPromise);
        return () => undefined;
      }),
    artifactReader: () => resolve(validRunPlan),
    planningWorkerStarter: (input) => {
      startedWorkers.push(input.issueId);
      return resolve(undefined);
    },
  });

  try {
    await runFuture(
      services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  const planningDir = path.join(
    preparedWorktree,
    ".autobot",
    "runs",
    issueId,
    "attempt-1",
  );

  assert.deepEqual(startedWorkers, [issueId]);
  assert.ok(writtenPaths.length > 0);
  assert.ok(
    writtenPaths.every(
      (writtenPath) => path.dirname(writtenPath) === planningDir,
    ),
  );
  assert.equal(
    fixture.itemUpserts.some((upsert) => upsert.state === "failed"),
    false,
  );
});

test("planning failure records message from structured plain-object errors", async () => {
  const issueId = "REP-517";
  const fixture = makeWorkflowStore({
    items: [firstTickQueuedItem(issueId, "2026-05-15T09:00:00Z")],
  });
  const services = createAutobotServices({
    prepareWorktree: () =>
      resolve({
        issue_id: issueId,
        branch: `autobot/${issueId}`,
        slug: issueId,
        worktree_path: `/worktrees/autobot/.autobot/worktrees/${issueId}`,
        archived_worktree_path: null,
      }),
    openStore: () => resolve(fixture.store as unknown as AutobotStore),
    now: () => "2026-05-15T12:00:00Z",
    randomId: () => "run-plain-object-error",
    loadLinearIssue: () =>
      Future((reject) => {
        reject({
          code: "AUTOBOT-LINEAR-ISSUE-LOAD-FAILED",
          message: "AUTOBOT-LINEAR-ISSUE-LOAD-FAILED",
        });
        return () => undefined;
      }),
  });

  await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  );

  const lastError = fixture.itemUpserts.at(-1)?.last_error as
    | { message?: string }
    | null
    | undefined;

  assert.equal(lastError?.message, "AUTOBOT-LINEAR-ISSUE-LOAD-FAILED");
});
