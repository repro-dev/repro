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

test("workflow commands surface the FlowCraft skeleton", async () => {
  const fixture = makeWorkflowStore();
  let openStoreCalls = 0;
  const services = createAutobotServices({
    openStore() {
      openStoreCalls += 1;
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const listResult = (await runFuture(
    services.handleInvocation(
      makeInvocation(["engine", "debug", "workflow", "list"]),
    ),
  )) as AutobotCommandResult;

  assert.equal(listResult.kind, "workflow-list");
  assert.equal(listResult.command, "engine debug workflow list");
  assert.deepEqual(listResult.data.workflows[0]?.node_ids, [
    "claim",
    "reconcile",
    "complete",
  ]);

  const validationResult = (await runFuture(
    services.handleInvocation(
      makeInvocation(["engine", "debug", "workflow", "validate"]),
    ),
  )) as AutobotCommandResult;

  assert.equal(validationResult.kind, "workflow-validation");
  assert.equal(validationResult.data.validations[0]?.valid, true);

  const diagramResult = (await runFuture(
    services.handleInvocation(
      makeInvocation(["engine", "debug", "workflow", "diagram"]),
    ),
  )) as AutobotCommandResult;

  assert.equal(diagramResult.kind, "workflow-diagram");
  assert.match(diagramResult.data.diagram, /flowchart TD/);
  assert.equal(openStoreCalls, 0);
});

test("inspect resolves runs and flowcraft executions with persisted events", async () => {
  const fixture = makeWorkflowStore();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const result = (await runFuture(
    services.handleInvocation(makeInvocation(["inspect"])),
  ).catch((error) => error)) as Error;

  assert.match(result.message, /inspect requires a run id/);

  const byRun = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["inspect"]),
      args: ["run-1154"],
      command: "inspect run-1154",
    }),
  )) as AutobotCommandResult;

  assert.equal(byRun.kind, "flowcraft-inspect");
  assert.equal(byRun.data.lookup.kind, "run");
  assert.equal(byRun.data.lookup.domain_events.length, 1);
  assert.equal(byRun.data.lookup.flowcraft_events.length, 1);
});

test("inspect loads domain events for runs without flowcraft execution ids", async () => {
  const fixture = makeWorkflowStore();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const byRun = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["inspect"]),
      args: ["run-1155"],
      command: "inspect run-1155",
    }),
  )) as AutobotCommandResult;

  assert.equal(byRun.kind, "flowcraft-inspect");
  assert.equal(byRun.data.lookup.kind, "run");
  assert.equal(byRun.data.lookup.domain_events.length, 1);
  assert.equal(byRun.data.lookup.flowcraft_events.length, 0);
  assert.deepEqual(fixture.domainEventLookups[0], {
    issueId: "REP-1155",
    options: { runId: "run-1155" },
  });
});

test("inspect routes flowcraft execution ids directly to execution lookup", async () => {
  const fixture = makeWorkflowStore();
  const services = createAutobotServices({
    openStore() {
      return resolve(fixture.store as unknown as AutobotStore);
    },
  });

  const result = (await runFuture(
    services.handleInvocation({
      ...makeInvocation(["inspect"]),
      args: ["flowcraft-exec-1156"],
      command: "inspect flowcraft-exec-1156",
    }),
  )) as AutobotCommandResult;

  assert.equal(result.kind, "flowcraft-inspect");
  assert.equal(result.data.lookup.kind, "flowcraft-execution");
  assert.deepEqual(fixture.runGetLookups, []);
  assert.deepEqual(fixture.flowcraftGetLookups, ["flowcraft-exec-1156"]);
});
