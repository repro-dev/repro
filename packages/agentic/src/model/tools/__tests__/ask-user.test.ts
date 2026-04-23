import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "fluture";

import { executeTool, tools } from "../index";
import { runFuture } from "./helpers";
import type {
  RecordingDataAccessor,
  ToolExecutionContext,
} from "../../../types";

function makeEmptyAccessor(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => null,
    getResourceMap: () => ({}),
    getEventsByType: () => [],
    getEventsInRange: () => [],
  };
}

const recording = makeEmptyAccessor();

test("registers askUser in the tool registry", () => {
  assert.ok(tools.some((tool) => tool.function.name === "askUser"));
});

test("returns a structured error when the host callback is missing", async () => {
  const result = (await runFuture(
    executeTool(recording, "askUser", {
      prompt: "Choose a path",
    }),
  )) as { error: string };

  assert.equal(result.error, "askUser is unavailable");
});

test("delegates askUser prompts to the host callback", async () => {
  let received: { prompt: string; toolCallId: string } | null = null;

  const context: ToolExecutionContext = {
    toolCall: {
      id: "tool-call-1",
      index: 0,
      function: {
        name: "askUser",
        arguments: JSON.stringify({ prompt: "Choose", multiple: false }),
      },
    },
    askUser: (request, toolCallId) => {
      received = { prompt: request.prompt, toolCallId };
      return resolve({ answer: "yes" });
    },
  };

  const result = (await runFuture(
    executeTool(
      recording,
      "askUser",
      {
        prompt: "Choose",
        multiple: false,
      },
      context,
    ),
  )) as { answer: string };

  assert.deepEqual(received, {
    prompt: "Choose",
    toolCallId: "tool-call-1",
  });
  assert.deepEqual(result, { answer: "yes" });
});
