import assert from "node:assert/strict";
import test from "node:test";

import { createAutobotProgram } from "../program";
import type { AutobotInvocation } from "../types";

test("queue commands and global flags are present in the parser tree", () => {
  const program = createAutobotProgram();
  const topLevelNames = program.commands
    .map((command) => command.name())
    .sort();

  assert.deepStrictEqual(topLevelNames, [
    "add",
    "cancel",
    "config",
    "discover",
    "inspect",
    "list",
    "logs",
    "reconcile",
    "remove",
    "retry",
    "status",
    "supervisor",
  ]);

  const flagNames = program.options.map((option) => option.flags);

  assert.ok(flagNames.some((flags) => flags.includes("--json")));
  assert.ok(flagNames.some((flags) => flags.includes("--repo")));
  assert.ok(flagNames.some((flags) => flags.includes("--state-dir")));
  assert.ok(flagNames.some((flags) => flags.includes("--profile")));
  assert.ok(flagNames.some((flags) => flags.includes("--quiet")));
  assert.ok(flagNames.some((flags) => flags.includes("--verbose")));
  assert.ok(flagNames.some((flags) => flags.includes("--no-color")));

  const addCommand = program.commands.find(
    (command) => command.name() === "add",
  );
  const removeCommand = program.commands.find(
    (command) => command.name() === "remove",
  );
  const statusCommand = program.commands.find(
    (command) => command.name() === "status",
  );
  const discoverCommand = program.commands.find(
    (command) => command.name() === "discover",
  );

  assert.ok(
    addCommand?.options.some((option) => option.flags.includes("--dry-run")),
  );
  assert.ok(
    removeCommand?.options.some((option) => option.flags.includes("--dry-run")),
  );
  assert.ok(
    removeCommand?.options.some((option) => option.flags.includes("--force")),
  );
  assert.match(statusCommand?.usage() ?? "", /issue-id/);
  assert.ok(program.options.some((option) => option.flags.includes("-q")));
  assert.ok(
    discoverCommand?.options.some((option) =>
      option.flags.includes("--project"),
    ),
  );
  assert.ok(
    discoverCommand?.options.some((option) => option.flags.includes("--label")),
  );
  assert.ok(
    discoverCommand?.options.some((option) =>
      option.flags.includes("--priority"),
    ),
  );
  assert.ok(
    discoverCommand?.options.some((option) => option.flags.includes("--limit")),
  );
});

test("discover accepts repeatable project flags", () => {
  let invocation: AutobotInvocation | null = null;
  const program = createAutobotProgram({
    onInvocation(nextInvocation) {
      invocation = nextInvocation;
    },
  });

  program.parse([
    "node",
    "autobot-next",
    "discover",
    "--project",
    "Engineering",
    "--project",
    "Platform",
  ]);

  if (invocation === null) {
    throw new Error("expected discover invocation");
  }

  const discoverInvocation = invocation as AutobotInvocation;

  assert.deepStrictEqual(discoverInvocation.options.project, [
    "Engineering",
    "Platform",
  ]);
  assert.deepStrictEqual(discoverInvocation.args, []);
});

test("discover preserves an explicit query argument without option objects", () => {
  let invocation: AutobotInvocation | null = null;
  const program = createAutobotProgram({
    onInvocation(nextInvocation) {
      invocation = nextInvocation;
    },
  });

  program.parse([
    "node",
    "autobot-next",
    "discover",
    "REP-11",
    "--project",
    "Platform",
  ]);

  if (invocation === null) {
    throw new Error("expected discover invocation");
  }

  const discoverInvocation = invocation as AutobotInvocation;

  assert.deepStrictEqual(discoverInvocation.args, ["REP-11"]);
  assert.deepStrictEqual(discoverInvocation.options.project, ["Platform"]);
});
