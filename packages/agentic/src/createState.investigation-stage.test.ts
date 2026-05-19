import { resolve } from "fluture";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createAgenticState,
  type RecordingDataAccessor,
  type StreamProvider,
} from "./index";

function makeAccessor(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => null,
    getResourceMap: () => ({}),
    getEventsByType: () => [],
    getEventsInRange: () => [],
  };
}

function makeDoneStream(): ReadableStream<{ data: string }> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({ data: "[DONE]" });
      controller.close();
    },
  });
}

function makeToolCallStream(
  toolCallId: string,
  toolName: string,
  args: Record<string, unknown>,
): ReadableStream<{ data: string }> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue({
        data: JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: toolCallId,
                    function: {
                      name: toolName,
                      arguments: JSON.stringify(args),
                    },
                  },
                ],
              },
            },
          ],
        }),
      });
      controller.enqueue({ data: "[DONE]" });
      controller.close();
    },
  });
}

function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const started = Date.now();

    function check() {
      if (predicate()) {
        resolvePromise();
        return;
      }

      if (Date.now() - started > timeoutMs) {
        rejectPromise(new Error("Timed out waiting for condition"));
        return;
      }

      setTimeout(check, 10);
    }

    check();
  });
}

describe("createAgenticState investigation stage", () => {
  it("starts idle, enters orient on query, and resets back to idle", async () => {
    const streamProvider: StreamProvider = () =>
      resolve(makeDoneStream()) as never;
    const state = createAgenticState(streamProvider, makeAccessor());

    assert.equal(state.$stage.getValue(), "idle");
    assert.deepEqual(state.$hypotheses.getValue(), []);

    state.query("Why did this fail?");

    assert.equal(state.$stage.getValue(), "orient");

    await waitFor(() => state.$loading.getValue() === "none");

    state.reset();

    assert.equal(state.$stage.getValue(), "idle");
    assert.deepEqual(state.$hypotheses.getValue(), []);

    state.destroy();
  });

  it("advances through hypotheses, evidence, and conclusion when supported", async () => {
    const hypotheses = [
      {
        id: "h1",
        description: "The request is failing before render",
        evidence: [],
      },
    ];

    let callCount = 0;
    const streamProvider: StreamProvider = () => {
      callCount += 1;

      if (callCount === 1) {
        return resolve(
          makeToolCallStream("advance-hypotheses", "advanceStage", {
            stage: "hypotheses",
            hypotheses,
          }),
        ) as never;
      }

      if (callCount === 2) {
        return resolve(
          makeToolCallStream("advance-evidence", "advanceStage", {
            stage: "evidence",
            hypotheses: [
              {
                ...hypotheses[0],
                evidence: ["console error at 3.2s"],
              },
            ],
          }),
        ) as never;
      }

      if (callCount === 3) {
        return resolve(
          makeToolCallStream("advance-conclusion", "advanceStage", {
            stage: "conclusion",
            hypotheses: [
              {
                ...hypotheses[0],
                evidence: ["console error at 3.2s"],
              },
            ],
          }),
        ) as never;
      }

      return resolve(makeDoneStream()) as never;
    };

    const state = createAgenticState(streamProvider, makeAccessor());

    state.query("Why did the button stop working?");

    await waitFor(() => state.$loading.getValue() === "none");

    assert.equal(state.$stage.getValue(), "conclusion");
    assert.deepEqual(state.$hypotheses.getValue(), [
      {
        id: "h1",
        description: "The request is failing before render",
        evidence: ["console error at 3.2s"],
      },
    ]);

    state.destroy();
  });

  it("blocks conclusion without evidence and leaves the stage unchanged", async () => {
    let callCount = 0;
    const streamProvider: StreamProvider = () => {
      callCount += 1;

      if (callCount === 1) {
        return resolve(
          makeToolCallStream("advance-conclusion", "advanceStage", {
            stage: "conclusion",
            hypotheses: [
              {
                id: "h1",
                description: "The request is failing before render",
                evidence: [],
              },
            ],
          }),
        ) as never;
      }

      return resolve(makeDoneStream()) as never;
    };

    const state = createAgenticState(streamProvider, makeAccessor());

    state.query("Why did this fail?");

    await waitFor(() => state.$loading.getValue() === "none");

    assert.equal(state.$stage.getValue(), "orient");

    const toolMessage = state.$entries
      .getValue()
      .find((entry) => entry.role === "tool");

    assert.ok(toolMessage);
    assert.match(
      JSON.stringify(toolMessage?.content),
      /Conclusion requires evidence/,
    );

    state.destroy();
  });
});
