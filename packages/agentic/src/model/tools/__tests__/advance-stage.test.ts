import { fork, resolve, type FutureInstance } from "fluture";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handler } from "../advance-stage";
import type {
  RecordingDataAccessor,
  ToolExecutionContext,
} from "../../../types";

function runFuture<R>(future: FutureInstance<unknown, R>): Promise<R> {
  return new Promise((resolvePromise, rejectPromise) => {
    future.pipe(fork(rejectPromise)(resolvePromise));
  });
}

function makeAccessor(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => null,
    getResourceMap: () => ({}),
    getEventsByType: () => [],
    getEventsInRange: () => [],
  };
}

describe("advanceStage tool", () => {
  it("delegates valid payloads to the runtime callback", async () => {
    let received: unknown;
    const context: ToolExecutionContext = {
      advanceStage: (input) => {
        received = input;
        return resolve({
          stage: input.stage,
          hypotheses: input.hypotheses ?? [],
          readiness: "ready to conclude",
        });
      },
    };

    const result = await runFuture(
      handler(
        makeAccessor(),
        {
          stage: "conclusion",
          hypotheses: [
            { id: "h1", description: "A", evidence: ["console error"] },
          ],
        },
        context,
      ),
    );

    assert.deepEqual(received, {
      stage: "conclusion",
      hypotheses: [{ id: "h1", description: "A", evidence: ["console error"] }],
    });
    assert.deepEqual(result, {
      stage: "conclusion",
      hypotheses: [{ id: "h1", description: "A", evidence: ["console error"] }],
      readiness: "ready to conclude",
    });
  });

  it("returns a structured error when the runtime callback is missing", async () => {
    const result = await runFuture(
      handler(makeAccessor(), {
        stage: "orient",
      }),
    );

    assert.ok(result !== null && typeof result === "object");
    assert.equal(
      (result as { error: string }).error,
      "advanceStage is unavailable",
    );
  });

  it("rejects invalid stage and hypothesis payloads", async () => {
    const context: ToolExecutionContext = {
      advanceStage: () =>
        resolve({
          stage: "orient",
          hypotheses: [],
          readiness: "needs more evidence",
        }),
    };

    const invalidStage = await runFuture(
      handler(makeAccessor(), { stage: "idle" }, context),
    );

    assert.ok(invalidStage !== null && typeof invalidStage === "object");
    assert.equal(
      (invalidStage as { error: string }).error,
      "Invalid investigation stage",
    );

    const invalidHypotheses = await runFuture(
      handler(
        makeAccessor(),
        {
          stage: "hypotheses",
          hypotheses: [{ id: "", description: "", evidence: [""] }],
        },
        context,
      ),
    );

    assert.ok(
      invalidHypotheses !== null && typeof invalidHypotheses === "object",
    );
    assert.equal(
      (invalidHypotheses as { error: string }).error,
      "Invalid hypothesis",
    );
  });
});
