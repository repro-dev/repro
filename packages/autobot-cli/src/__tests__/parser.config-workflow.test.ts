import assert from "node:assert/strict";
import test from "node:test";

import { createAutobotProgram } from "../program";
import { collectCommandPaths } from "./helpers";

test("config and workflow command groups are present in the parser tree", () => {
  const program = createAutobotProgram();
  const topLevelNames = program.commands
    .map((command) => command.name())
    .sort();

  assert.ok(topLevelNames.includes("config"));
  assert.ok(topLevelNames.includes("workflow"));

  const nestedPaths = collectCommandPaths(program).filter(
    (path) => path.startsWith("config ") || path.startsWith("workflow "),
  );

  assert.deepStrictEqual(nestedPaths.sort(), [
    "config get",
    "config list",
    "config set",
    "config unset",
    "workflow diagram",
    "workflow list",
    "workflow validate",
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
