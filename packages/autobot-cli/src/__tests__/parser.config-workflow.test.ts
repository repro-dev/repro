import assert from "node:assert/strict";
import test from "node:test";

import { createAutobotProgram } from "../program";
import { collectCommandPaths } from "./helpers";

test("config and supervisor debug workflow command groups are present in the parser tree", () => {
  const program = createAutobotProgram();
  const topLevelNames = program.commands
    .map((command) => command.name())
    .sort();

  assert.ok(topLevelNames.includes("config"));
  assert.ok(topLevelNames.includes("supervisor"));
  assert.ok(!topLevelNames.includes("workflow"));

  const nestedPaths = collectCommandPaths(program).filter(
    (path) => path.startsWith("config ") || path.startsWith("supervisor debug"),
  );

  assert.deepStrictEqual(nestedPaths.sort(), [
    "config get",
    "config list",
    "config set",
    "config unset",
    "supervisor debug",
    "supervisor debug workflow",
    "supervisor debug workflow diagram",
    "supervisor debug workflow list",
    "supervisor debug workflow validate",
  ]);

  const configGroup = program.commands.find(
    (command) => command.name() === "config",
  );
  const setCommand = configGroup?.commands.find(
    (command) => command.name() === "set",
  );
  const unsetCommand = configGroup?.commands.find(
    (command) => command.name() === "unset",
  );

  assert.ok(
    setCommand?.options.some((option) => option.flags.includes("--dry-run")),
  );
  assert.ok(
    unsetCommand?.options.some((option) => option.flags.includes("--dry-run")),
  );
});
