import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
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

test("supervisor status and logs use supervisor kinds while engine remains supported", async () => {
  const root = await mkdtemp(
    path.join(process.cwd(), "..", "..", "tmp", "autobot-supervisor-"),
  );
  const fixture = makeWorkflowStore();
  fixture.store.repo.path = root;
  fixture.store.repo.state_dir = ".autobot";

  const services = createAutobotServices({
    artifactWriter: () => resolve(undefined),
    loadLinearIssue: () => resolve(null),
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  try {
    const status = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["supervisor", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(status.kind, "supervisor-status");
    assert.equal(status.data.supervisor?.state, "stopped");

    const logs = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["supervisor", "logs"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(logs.kind, "supervisor-logs");

    const runOnce = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["supervisor", "run-once"]),
        options: makeOptions({ repo: root, dry_run: true }),
      }),
    )) as AutobotCommandResult;

    assert.equal(runOnce.kind, "supervisor-status");
    assert.equal(runOnce.data.supervisor?.state, "unknown");
    assert.match(
      runOnce.data.config.find((entry) => entry.key === "engine.auto-discover")
        ?.description ?? "",
      /supervisor ticks/i,
    );
    assert.doesNotMatch(
      runOnce.data.config.find(
        (entry) => entry.key === "engine.max-concurrency",
      )?.description ?? "",
      /local engine/i,
    );

    const legacy = (await runFuture(
      services.handleInvocation({
        ...makeInvocation(["engine", "status"]),
        options: makeOptions({ repo: root }),
      }),
    )) as AutobotCommandResult;

    assert.equal(legacy.kind, "engine-status");
    assert.equal(legacy.data.engine.state, "stopped");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
