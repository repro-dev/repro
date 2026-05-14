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
