import assert from "node:assert/strict";
import test from "node:test";

import { fork, resolve, type FutureInstance } from "fluture";

import { discoverLinearIssues } from "../linear";

function runFuture<T>(future: FutureInstance<unknown, T>): Promise<T> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

test("discover linear issues repeats project flags and keeps status scope explicit", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];

  const result = await runFuture(
    discoverLinearIssues(
      {
        repoRoot: "/repo",
        projects: ["Engineering", "Platform"],
        limit: 5,
      },
      {
        runCommand(input) {
          calls.push(input);
          return resolve("[]");
        },
      },
    ),
  );

  assert.deepStrictEqual(result, []);
  assert.deepStrictEqual(calls, [
    {
      cwd: "/repo",
      command: "/repo/bin/linear",
      args: [
        "issue",
        "list",
        "--project",
        "Engineering",
        "--project",
        "Platform",
        "--status",
        "backlog",
        "--status",
        "todo",
        "--json",
        "identifier,title,url,priority,priorityLabel,status,project,assignee,labels",
        "--limit",
        "5",
      ],
    },
  ]);
});

test("discover linear issues uses the provided remote limit", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];

  const result = await runFuture(
    discoverLinearIssues(
      {
        repoRoot: "/repo",
        projects: ["Engineering"],
        limit: 17,
      },
      {
        runCommand(input) {
          calls.push(input);
          return resolve("[]");
        },
      },
    ),
  );

  assert.deepStrictEqual(result, []);
  assert.deepStrictEqual(calls[0]?.args.at(-1), "17");
});

test("discover linear issues omits the project flag when scanning all projects", async () => {
  const calls: Array<{ command: string; args: string[] }> = [];

  const result = await runFuture(
    discoverLinearIssues(
      {
        repoRoot: "/repo",
        projects: [],
        limit: 5,
      },
      {
        runCommand(input) {
          calls.push(input);
          return resolve("[]");
        },
      },
    ),
  );

  assert.deepStrictEqual(result, []);
  assert.deepStrictEqual(calls[0]?.args.includes("--project"), false);
});

test("discover linear issues reports malformed json loudly", async () => {
  await assert.rejects(
    runFuture(
      discoverLinearIssues(
        {
          repoRoot: "/repo",
          projects: ["Engineering"],
          limit: 5,
        },
        {
          runCommand() {
            return resolve("not json");
          },
        },
      ),
    ),
    (error: any) => {
      assert.equal(error.code, "AUTOBOT-LINEAR-DISCOVERY-FAILED");
      assert.match(error.message, /malformed/i);
      assert.ok(error.recovery_commands.length > 0);
      return true;
    },
  );
});
