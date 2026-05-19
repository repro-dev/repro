import assert from "node:assert/strict";
import test from "node:test";

import { createAutobotProgram } from "../program";
import { collectCommandPaths } from "./helpers";

test("operate commands and engine subcommands are present in the parser tree", () => {
  const program = createAutobotProgram();
  const topLevelNames = program.commands
    .map((command) => command.name())
    .sort();

  assert.ok(topLevelNames.includes("cancel"));
  assert.ok(topLevelNames.includes("engine"));
  assert.ok(topLevelNames.includes("inspect"));
  assert.ok(topLevelNames.includes("reconcile"));
  assert.ok(topLevelNames.includes("retry"));

  assert.deepStrictEqual(
    collectCommandPaths(program)
      .filter((path) => path.startsWith("engine "))
      .sort(),
    [
      "engine debug",
      "engine debug workflow",
      "engine debug workflow diagram",
      "engine debug workflow list",
      "engine debug workflow validate",
      "engine logs",
      "engine run-once",
      "engine start",
      "engine status",
      "engine stop",
    ],
  );

  const engineCommand = program.commands.find(
    (command) => command.name() === "engine",
  );
  const runOnceCommand = engineCommand?.commands.find(
    (command) => command.name() === "run-once",
  );

  assert.ok(runOnceCommand);
  assert.match(runOnceCommand!.description(), /scheduler tick/i);
  assert.match(runOnceCommand!.description(), /reconcile state/i);
  assert.ok(
    runOnceCommand!.options.some((option) =>
      option.flags.includes("--dry-run"),
    ),
  );

  const startCommand = engineCommand?.commands.find(
    (command) => command.name() === "start",
  );

  assert.ok(startCommand);
  assert.match(startCommand!.description(), /bounded full-queue tick pass/i);
  assert.match(startCommand!.description(), /repeating/i);
});
