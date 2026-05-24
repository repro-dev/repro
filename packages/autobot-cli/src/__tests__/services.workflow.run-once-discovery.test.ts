import assert from "node:assert/strict";
import path from "node:path";
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

const testRepoRoot = path.join(
  process.cwd(),
  "..",
  "..",
  "tmp",
  "autobot-cli-worktree-tests",
);

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

const noOpArtifactWriter = () => resolve(undefined);
const noOpArtifactReader = (_input: { path: string }) => {
  return resolve(validRunPlan);
};
const noOpLinearIssue = () => resolve(null);
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
  "- Modify the selected issue files.",
].join("\n");
const noOpPlanningSessionRunner = (input: { phase?: string }) => {
  void input;
  return resolve({
    command: "opencode",
    args: ["run"],
    started_at: "2026-05-15T12:00:01Z",
    finished_at: "2026-05-15T12:00:02Z",
    exit_code: 0,
    signal: null,
    stdout: validRunPlan,
    stderr: "",
  });
};

function makeOptions(
  overrides: Partial<AutobotGlobalOptions> = {},
): AutobotGlobalOptions {
  return {
    json: false,
    repo: testRepoRoot,
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

test("supervisor run-once preserves discovered metadata when it selects a new candidate", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.auto-discover": true,
      "supervisor.queue-depth": 1,
      "supervisor.max-concurrency": 1,
      "discovery.projects": "Engineering, Platform",
    },
    items: [],
  });
  fixture.store.repo.path = testRepoRoot;
  fixture.store.repo.state_dir = ".autobot";
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:30:00Z";
    },
    prepareWorktree(input) {
      return resolve({
        issue_id: input.issueId,
        branch: `autobot/${input.issueId}`,
        slug: input.issueId,
        worktree_path: `${input.repoRoot}/.autobot/worktrees/${input.issueId}`,
        archived_worktree_path: null,
      });
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
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
  assert.deepEqual(result.data.tick?.selected_issue_ids, ["REP-400"]);
  assert.deepEqual(result.data.tick?.queued_issue_ids, ["REP-400"]);
  assert.ok(
    result.data.tick?.skipped.some(
      (item) =>
        item.issue_id === "REP-401" && item.reason === "queue-depth-exhausted",
    ),
  );
  assert.ok(fixture.artifactRecords.length >= 3);
  assert.equal(fixture.artifactRecords.at(-1)?.kind, "run-plan");

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
      branch: lastRep400Upsert.branch,
    },
    {
      title: "Discovered one",
      url: "https://linear.app/repro/issue/REP-400/discovered-one",
      priority: 2,
      owner: "Gary",
      workspace: path.join(testRepoRoot, ".autobot", "worktrees", "REP-400"),
      branch: "autobot/REP-400",
    },
  );
});

test("supervisor run-once warns and skips discovery when discovery.projects is missing", async () => {
  const fixture = makeWorkflowStore({
    configOverrides: {
      "supervisor.auto-discover": true,
    },
    items: [],
  });
  fixture.store.repo.path = testRepoRoot;
  fixture.store.repo.state_dir = ".autobot";
  const services = createAutobotServices({
    artifactWriter: noOpArtifactWriter,
    artifactReader: noOpArtifactReader,
    planningSessionRunner: noOpPlanningSessionRunner,
    loadLinearIssue: noOpLinearIssue,
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
    now() {
      return "2026-05-15T12:00:00Z";
    },
    prepareWorktree(input) {
      return resolve({
        issue_id: input.issueId,
        branch: `autobot/${input.issueId}`,
        slug: input.issueId,
        worktree_path: `${input.repoRoot}/.autobot/worktrees/${input.issueId}`,
        archived_worktree_path: null,
      });
    },
    discoverIssues() {
      throw new Error(
        "discoverIssues should not be called when projects are missing",
      );
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["supervisor", "run-once"])),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "supervisor-status");
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
