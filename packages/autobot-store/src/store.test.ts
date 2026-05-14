import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, test } from "node:test";

import SQLiteDatabase from "better-sqlite3";
import { fork, type FutureInstance } from "fluture";

import { createAutobotStore } from "./client";
import type { AutobotStore } from "./repositories";

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

function dbPath(repoRoot: string) {
  return path.join(repoRoot, ".autobot", "autobot.sqlite");
}

async function openStore(repoRoot: string): Promise<AutobotStore> {
  return runFuture<AutobotStore>(createAutobotStore({ repo: repoRoot }));
}

function openRawDb(repoRoot: string) {
  return new SQLiteDatabase(dbPath(repoRoot));
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root !== undefined) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("initializes sqlite state and FlowCraft indexes", async () => {
  const repoRoot = await makeRepoRoot();
  const store = await openStore(repoRoot);
  const db = openRawDb(repoRoot);

  const migrations = db
    .prepare("SELECT name FROM autobot_migrations ORDER BY name")
    .all() as Array<{ name: string }>;
  assert.equal(migrations.length, 1);
  assert.equal(migrations[0]?.name, "0001_initial_schema");

  const flowcraftIndexes = db
    .prepare("PRAGMA index_list('flowcraft_executions')")
    .all() as Array<{ name: string }>;
  assert.equal(
    flowcraftIndexes.some(
      (index) => index.name === "idx_flowcraft_executions_issue_started_at",
    ),
    true,
  );

  db.close();
  await runFuture(store.close());
});

test("bounded event hydration only loads the most recent window", async () => {
  const repoRoot = await makeRepoRoot();
  const store = await openStore(repoRoot);

  await runFuture(
    store.items.upsert({
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

  for (let index = 0; index < 60; index += 1) {
    await runFuture(
      store.events.append({
        event_id: `evt-${index}`,
        issue_id: "REP-1150",
        run_id: null,
        type: `phase.${index}`,
        state: "queued",
        message: `Event ${index}`,
        severity: "info",
        occurred_at: `2026-05-14T09:${String(index).padStart(2, "0")}:00Z`,
        actor: "engine",
        data: { index },
      }),
    );
  }

  const detail = await runFuture(store.projections.getItemDetail("REP-1150"));
  const listWindow = await runFuture(
    store.events.list("REP-1150", { limit: 10 }),
  );

  assert.equal(detail?.events.length, 50);
  assert.equal(detail?.events[0]?.type, "phase.10");
  assert.equal(detail?.events[49]?.type, "phase.59");
  assert.equal(listWindow.length, 10);
  assert.equal(listWindow[0]?.type, "phase.0");

  await runFuture(store.close());
});

test("artifact writes return the inserted row exactly", async () => {
  const repoRoot = await makeRepoRoot();
  const store = await openStore(repoRoot);
  const db = openRawDb(repoRoot);

  db.prepare(
    "INSERT INTO artifacts (issue_id, run_id, attempt, kind, path, description, content_hash, supersedes_artifact_id, inherited_from_artifact_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    "REP-1150",
    "run-1",
    1,
    "context",
    ".autobot/runs/REP-1150/attempt-1/context.md",
    "existing collision",
    "old-hash",
    null,
    null,
    "2026-05-14T09:02:30Z",
  );

  const inserted = await runFuture(
    store.artifacts.record({
      issue_id: "REP-1150",
      run_id: "run-2",
      attempt: 2,
      kind: "context",
      path: ".autobot/runs/REP-1150/attempt-1/context.md",
      description: "new planning context",
      content_hash: "new-hash",
      supersedes_artifact_id: null,
      inherited_from_artifact_id: null,
      created_at: "2026-05-14T09:02:30Z",
    }),
  );

  assert.equal(inserted.description, "new planning context");
  assert.equal(inserted.content_hash, "new-hash");
  assert.equal(inserted.run_id, "run-2");

  db.close();
  await runFuture(store.close());
});

test("domain events remain append-only through the database", async () => {
  const repoRoot = await makeRepoRoot();
  const store = await openStore(repoRoot);
  const db = openRawDb(repoRoot);

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

  assert.throws(() => {
    db.prepare("UPDATE domain_events SET message = ? WHERE event_id = ?").run(
      "mutated",
      "evt-append-only",
    );
  }, /append-only/i);

  assert.throws(() => {
    db.prepare("DELETE FROM domain_events WHERE event_id = ?").run(
      "evt-append-only",
    );
  }, /append-only/i);

  db.close();
  await runFuture(store.close());
});
