import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "node:test";

import { fork, type FutureInstance } from "fluture";

import type { AutobotStore } from "./repositories";
import { createAutobotStore, resolveAutobotDatabasePath } from "./client";

const tempRoots: string[] = [];

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolve, reject) => {
    fork(reject)(resolve)(future);
  });
}

async function makeRepoRoot() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const tmpDir = path.join(repoRoot, "tmp");
  await mkdir(tmpDir, { recursive: true });
  const tempDir = await mkdtemp(path.join(tmpDir, "autobot-store-"));
  tempRoots.push(tempDir);
  return tempDir;
}

async function openStore(repoRoot: string): Promise<AutobotStore> {
  return runFuture<AutobotStore>(createAutobotStore({ repo: repoRoot }));
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("initializes the sqlite store under .autobot", async () => {
  const repoRoot = await makeRepoRoot();
  const store = await openStore(repoRoot);

  const dbPath = resolveAutobotDatabasePath(repoRoot);
  await assert.doesNotReject(stat(dbPath));

  const migrations = await store.db
    .selectFrom("autobot_migrations")
    .selectAll()
    .execute();

  assert.equal(migrations.length, 1);
  assert.equal(migrations[0]?.name, "0001_initial_schema");

  await runFuture(store.close());
});

test("persists items, events, config, and projections across restart", async () => {
  const repoRoot = await makeRepoRoot();

  const first = await openStore(repoRoot);
  await runFuture(
    first.items.upsert({
      issue_id: "REP-1150",
      title: "Implement local Autobot SQLite store and event log",
      url: "https://linear.app/repro/issue/REP-1150/implement-local-autobot-sqlite-store-and-event-log",
      state: "queued",
      attempt: 1,
      priority: 2,
      owner: "gary",
      workspace: "repro",
      branch: "autobot/REP-1150",
      queued_at: "2026-05-14T09:00:00Z",
      started_at: null,
      updated_at: "2026-05-14T09:01:00Z",
      last_event: "item.queued",
      last_error: null,
      recovery_commands: ["autobot-next retry REP-1150"],
      cancellation_requested: false,
      cancellation_requested_at: null,
      state_name: "Backlog",
      state_type: "planned",
      project: "Platform",
      labels: ["Feature"],
      assignee: "Gary",
      current_run_id: null,
    }),
  );

  await runFuture(
    first.events.append({
      event_id: "evt-1",
      issue_id: "REP-1150",
      run_id: null,
      type: "item.queued",
      state: "queued",
      message: "Item queued",
      severity: "info",
      occurred_at: "2026-05-14T09:01:00Z",
      actor: "engine",
      data: { attempt: 1 },
    }),
  );

  await runFuture(
    first.runs.upsert({
      run_id: "run-1",
      issue_id: "REP-1150",
      attempt: 1,
      state: "claimed",
      flowcraft_execution_id: "flow-1",
      blueprint_id: "blueprint-1",
      blueprint_version: "1",
      started_at: "2026-05-14T09:01:30Z",
      finished_at: null,
      worker_id: "worker-1",
      last_heartbeat_at: "2026-05-14T09:02:00Z",
    }),
  );

  await runFuture(
    first.artifacts.record({
      issue_id: "REP-1150",
      run_id: "run-1",
      attempt: 1,
      kind: "context",
      path: ".autobot/runs/REP-1150/attempt-1/context.md",
      description: "planning context",
      content_hash: "abc123",
      supersedes_artifact_id: null,
      inherited_from_artifact_id: null,
      created_at: "2026-05-14T09:02:30Z",
    }),
  );

  await runFuture(
    first.config.setOverride({
      key: "testing.command",
      value: "pnpm test",
      value_type: "string",
      source: "repo",
      updated_at: "2026-05-14T09:03:00Z",
    }),
  );

  await runFuture(first.close());

  const reopened = await openStore(repoRoot);
  const item = await runFuture(reopened.items.get("REP-1150"));
  const detail = await runFuture(
    reopened.projections.getItemDetail("REP-1150"),
  );
  const visibleItems = await runFuture(reopened.projections.listItems());
  const overrides = await runFuture(reopened.config.listOverrides());
  const events = await runFuture(reopened.events.list("REP-1150"));

  assert.equal(item?.state, "queued");
  assert.equal(detail?.current_run?.run_id, "run-1");
  assert.equal(
    detail?.artifacts[0]?.path,
    ".autobot/runs/REP-1150/attempt-1/context.md",
  );
  assert.equal(detail?.events[0]?.type, "item.queued");
  assert.equal(
    visibleItems.some((entry) => entry.issue_id === "REP-1150"),
    true,
  );
  assert.equal(overrides[0]?.key, "testing.command");
  assert.equal(overrides[0]?.value, "pnpm test");
  assert.equal(events[0]?.message, "Item queued");

  await runFuture(reopened.close());
});

test("domain events are append-only", async () => {
  const repoRoot = await makeRepoRoot();
  const store = await openStore(repoRoot);

  await runFuture(
    store.events.append({
      event_id: "evt-append-only",
      issue_id: "REP-1150",
      run_id: null,
      type: "item.queued",
      state: "queued",
      message: "Item queued",
      severity: "info",
      occurred_at: "2026-05-14T09:05:00Z",
      actor: "engine",
      data: {},
    }),
  );

  await assert.rejects(
    store.db
      .updateTable("domain_events")
      .set({ message: "mutated" })
      .where("event_id", "=", "evt-append-only")
      .execute(),
    /append-only/i,
  );

  await assert.rejects(
    store.db
      .deleteFrom("domain_events")
      .where("event_id", "=", "evt-append-only")
      .execute(),
    /append-only/i,
  );

  await runFuture(store.close());
});
