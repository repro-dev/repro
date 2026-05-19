import assert from "node:assert/strict";
import test from "node:test";

import { resolve, type FutureInstance, fork } from "fluture";

import type { AutobotStore } from "@repro/autobot-store";

import { makeWorkflowStore } from "./workflow-fixture";

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

const noOpPlanningSessionRunner = () =>
  resolve({
    command: "opencode",
    args: ["run"],
    started_at: "2026-05-15T12:00:01Z",
    finished_at: "2026-05-15T12:00:02Z",
    exit_code: 0,
    signal: null,
    stdout: "",
    stderr: "",
  });

test("engine run-once hydrates planning artifacts from the default Linear issue loader", async (t) => {
  const loadLinearIssueCalls: Array<{ repoRoot: string; issueId: string }> = [];

  t.mock.module("@repro/autobot-adapters", {
    namedExports: {
      discoverLinearIssues() {
        throw new Error("discoverLinearIssues should not be called");
      },
      loadLinearIssue(input: { repoRoot: string; issueId: string }) {
        loadLinearIssueCalls.push(input);
        return resolve({
          issue_id: input.issueId,
          title: "Hydrated queued item",
          url: "https://linear.app/repro/issue/REP-400/hydrated-queued-item",
          state_name: "Todo",
          state_type: "unstarted",
          project: "Engineering",
          labels: ["backend"],
          assignee: "Gary",
        });
      },
    },
  });

  const { createAutobotServices } = (await import(
    "../services"
  )) as typeof import("../services");

  const fixture = makeWorkflowStore({
    configOverrides: {
      "engine.max-concurrency": 1,
    },
    items: [
      {
        issue_id: "REP-400",
        title: "Queued item",
        url: "https://linear.app/repro/issue/REP-400/queued-item",
        state: "queued",
        attempt: 1,
        priority: 2,
        owner: "Gary",
        workspace: "autobot",
        branch: "autobot/REP-400",
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
        artifacts: [],
        events: [],
      },
    ],
  });

  const writes: Array<{ path: string; content: string }> = [];
  const services = createAutobotServices({
    artifactWriter(input) {
      writes.push(input);
      return resolve(undefined);
    },
    planningSessionRunner: noOpPlanningSessionRunner,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    randomId() {
      return "run-400";
    },
  });

  const result = (await runFuture(
    services.handleInvocation({
      command_path: ["engine", "run-once"],
      command: "engine run-once",
      args: [],
      options: {
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
      },
    }),
  )) as { kind: string; data: { tick?: { selected_issue_ids: string[] } } };

  assert.equal(result.kind, "queue-status");
  assert.deepEqual(loadLinearIssueCalls, [
    {
      repoRoot: "/worktrees/autobot",
      issueId: "REP-400",
    },
  ]);
  assert.equal(writes.length, 4);
  assert.equal(
    writes.at(-1)?.path,
    "/worktrees/autobot/.autobot/runs/REP-400/attempt-1/run-plan.md",
  );
  assert.match(writes[0]?.content ?? "", /Hydrated queued item/);
  assert.match(writes[0]?.content ?? "", /- Project: Engineering/);
  assert.match(writes[0]?.content ?? "", /- Labels: backend/);
  assert.match(writes[0]?.content ?? "", /- Assignee: Gary/);
});
