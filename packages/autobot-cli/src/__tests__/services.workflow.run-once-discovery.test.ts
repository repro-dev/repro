import assert from "node:assert/strict";
import test from "node:test";

import { resolve, type FutureInstance, fork } from "fluture";

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

test("engine run-once preserves discovered metadata when it selects a new candidate", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "engine.auto-discover": true,
      "engine.queue-depth": 1,
      "engine.max-concurrency": 1,
      "discovery.projects": "Engineering, Platform",
    },
    items: [],
  });
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:30:00Z";
    },
    randomId() {
      return "run-401";
    },
    discoverIssues() {
      return resolve([
        {
          issue_id: "REP-400",
          title: "Discovered one",
          url: "https://linear.app/repro/issue/REP-400/discovered-one",
          project: "Engineering",
          labels: ["backend"],
          priority: 2,
          priority_label: "High",
          status_name: "Todo",
          state_type: "unstarted",
          assignee: "Gary",
        },
        {
          issue_id: "REP-401",
          title: "Discovered two",
          url: "https://linear.app/repro/issue/REP-401/discovered-two",
          project: "Platform",
          labels: ["backend"],
          priority: 1,
          priority_label: "Urgent",
          status_name: "Todo",
          state_type: "unstarted",
          assignee: "Gary",
        },
      ]);
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["engine", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-status");
  assert.deepEqual(result.data.tick?.selected_issue_ids, ["REP-400"]);
  assert.deepEqual(result.data.tick?.queued_issue_ids, ["REP-400"]);
  assert.ok(
    result.data.tick?.skipped.some(
      (item) =>
        item.issue_id === "REP-401" && item.reason === "queue-depth-exhausted",
    ),
  );

  const rep400Upserts = fixture.itemUpserts.filter(
    (item) => item.issue_id === "REP-400",
  );
  assert.ok(rep400Upserts.length > 0);
  const lastRep400Upsert = rep400Upserts[rep400Upserts.length - 1]!;
  assert.deepEqual(
    {
      title: lastRep400Upsert.title,
      url: lastRep400Upsert.url,
      priority: lastRep400Upsert.priority,
      owner: lastRep400Upsert.owner,
      workspace: lastRep400Upsert.workspace,
    },
    {
      title: "Discovered one",
      url: "https://linear.app/repro/issue/REP-400/discovered-one",
      priority: 2,
      owner: "Gary",
      workspace: "Engineering",
    },
  );
});

test("engine run-once warns and skips discovery when discovery.projects is missing", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "engine.auto-discover": true,
    },
    items: [],
  });
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    discoverIssues() {
      throw new Error(
        "discoverIssues should not be called when projects are missing",
      );
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["engine", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "queue-status");
  assert.deepEqual(result.warnings?.map((warning) => warning.code), [
    "ENGINE_DISCOVERY_PROJECTS_MISSING",
  ]);
  assert.equal(result.data.tick?.dry_run, false);
  assert.deepEqual(result.data.tick?.reconciled_issue_ids, []);
  assert.deepEqual(result.data.tick?.discovered_issue_ids, []);
  assert.deepEqual(result.data.tick?.queued_issue_ids, []);
  assert.deepEqual(result.data.tick?.selected_issue_ids, []);
  assert.deepEqual(result.data.tick?.started_issue_ids, []);
  assert.equal(fixture.transactionCalls, 0);
});
