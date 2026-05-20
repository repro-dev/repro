import assert from "node:assert/strict";
import test from "node:test";

import { itemStates, nonTerminalItemStates, terminalItemStates } from "./index";

test("escalated is a public terminal item state", () => {
  assert.equal(itemStates.includes("escalated"), true);
  assert.equal(nonTerminalItemStates.includes("escalated"), false);
  assert.deepEqual(terminalItemStates, ["escalated", "completed", "canceled"]);
});
