import assert from "node:assert/strict";
import test from "node:test";

import { createAutobotProgram } from "../program";

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
    "engine",
    "inspect",
    "list",
    "logs",
    "reconcile",
    "remove",
    "retry",
    "status",
    "workflow",
  ]);

  const flagNames = program.options.map((option) => option.flags);

  assert.ok(flagNames.some((flags) => flags.includes("--json")));
  assert.ok(flagNames.some((flags) => flags.includes("--repo")));
  assert.ok(flagNames.some((flags) => flags.includes("--state-dir")));
  assert.ok(flagNames.some((flags) => flags.includes("--profile")));
  assert.ok(flagNames.some((flags) => flags.includes("--quiet")));
  assert.ok(flagNames.some((flags) => flags.includes("--verbose")));
  assert.ok(flagNames.some((flags) => flags.includes("--no-color")));
});
