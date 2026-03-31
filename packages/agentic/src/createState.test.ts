import assert from "node:assert";
import { describe, it } from "node:test";
import {
  MAX_TOOL_ITERATIONS,
  accumulateToolCalls,
  buildIterationLimitMessage,
  buildToolMessageContent,
  createAgenticState,
  executeToolCalls,
  isValidMessageDelta,
} from "./createState";
import { RecordingDataAccessor, StreamProvider, ToolCall } from "./types";
import {
  fork,
  Future,
  isFuture,
  FutureInstance,
  resolve,
  reject as futureReject,
} from "fluture";

function makeEmptyAccessor(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => null,
    getEventsByType: () => [],
    getEventsInRange: () => [],
    getResourceMap: () => ({}),
  };
}

describe("isValidMessageDelta", () => {
  it("accepts valid delta with content", () => {
    const data = {
      choices: [{ delta: { content: "hello" } }],
    };
    assert.strictEqual(isValidMessageDelta(data), true);
  });

  it("accepts valid delta with tool_calls", () => {
    const data = {
      choices: [
        {
          delta: {
            tool_calls: [
              { index: 0, id: "tc1", function: { name: "foo", arguments: "" } },
            ],
          },
        },
      ],
    };
    assert.strictEqual(isValidMessageDelta(data), true);
  });

  it("accepts valid delta with empty delta object", () => {
    const data = { choices: [{ delta: {} }] };
    assert.strictEqual(isValidMessageDelta(data), true);
  });

  it("rejects null", () => {
    assert.strictEqual(isValidMessageDelta(null), false);
  });

  it("rejects undefined", () => {
    assert.strictEqual(isValidMessageDelta(undefined), false);
  });

  it("rejects plain string", () => {
    assert.strictEqual(isValidMessageDelta("hello"), false);
  });

  it("rejects object without choices", () => {
    assert.strictEqual(isValidMessageDelta({ role: "assistant" }), false);
  });

  it("rejects object with empty choices array", () => {
    assert.strictEqual(isValidMessageDelta({ choices: [] }), false);
  });

  it("rejects object with non-array choices", () => {
    assert.strictEqual(isValidMessageDelta({ choices: "bad" }), false);
  });

  it("rejects when choices[0].delta is null", () => {
    assert.strictEqual(
      isValidMessageDelta({ choices: [{ delta: null }] }),
      false,
    );
  });

  it("rejects when choices[0].delta is missing", () => {
    assert.strictEqual(isValidMessageDelta({ choices: [{}] }), false);
  });
});

describe("accumulateToolCalls", () => {
  it("first delta creates new entry with id, index, function.name, function.arguments", () => {
    const result = accumulateToolCalls(
      [],
      [
        {
          index: 0,
          id: "tc1",
          function: { name: "myTool", arguments: '{"a":' },
        },
      ],
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.id, "tc1");
    assert.strictEqual(result[0]!.index, 0);
    assert.strictEqual(result[0]!.function.name, "myTool");
    assert.strictEqual(result[0]!.function.arguments, '{"a":');
  });

  it("subsequent deltas append arguments only (not name)", () => {
    const initial = accumulateToolCalls(
      [],
      [
        {
          index: 0,
          id: "tc1",
          function: { name: "myTool", arguments: '{"a":' },
        },
      ],
    );
    const result = accumulateToolCalls(initial, [
      { index: 0, function: { arguments: "1}" } },
    ]);
    assert.strictEqual(result[0]!.function.name, "myTool");
    assert.strictEqual(result[0]!.function.arguments, '{"a":1}');
  });

  it("sparse index handling — delta at index 2 with empty array", () => {
    const result = accumulateToolCalls(
      [],
      [
        {
          index: 2,
          id: "tc2",
          function: { name: "sparseFunc", arguments: "" },
        },
      ],
    );
    assert.strictEqual(result[2]!.id, "tc2");
    assert.strictEqual(result[2]!.function.name, "sparseFunc");
  });

  it("multiple parallel tool calls accumulate correctly", () => {
    const step1 = accumulateToolCalls(
      [],
      [
        {
          index: 0,
          id: "tc0",
          function: { name: "funcA", arguments: '{"x":' },
        },
        {
          index: 1,
          id: "tc1",
          function: { name: "funcB", arguments: '{"y":' },
        },
      ],
    );
    const result = accumulateToolCalls(step1, [
      { index: 0, function: { arguments: "1}" } },
      { index: 1, function: { arguments: "2}" } },
    ]);
    assert.strictEqual(result[0]!.function.arguments, '{"x":1}');
    assert.strictEqual(result[1]!.function.arguments, '{"y":2}');
  });

  it("returns new array (immutability)", () => {
    const original: Array<ToolCall> = [];
    const result = accumulateToolCalls(original, [
      { index: 0, id: "tc1", function: { name: "f", arguments: "" } },
    ]);
    assert.notStrictEqual(result, original);
  });

  it("defaults missing id to empty string", () => {
    const result = accumulateToolCalls(
      [],
      [{ index: 0, function: { name: "f", arguments: "" } }],
    );
    assert.strictEqual(result[0]!.id, "");
  });

  it("defaults missing name to empty string", () => {
    const result = accumulateToolCalls(
      [],
      [{ index: 0, id: "tc1", function: { arguments: "" } }],
    );
    assert.strictEqual(result[0]!.function.name, "");
  });

  it("defaults missing arguments to empty string", () => {
    const result = accumulateToolCalls(
      [],
      [{ index: 0, id: "tc1", function: { name: "f" } }],
    );
    assert.strictEqual(result[0]!.function.arguments, "");
  });

  it("id from existing entry takes precedence over empty delta id", () => {
    const initial = accumulateToolCalls(
      [],
      [{ index: 0, id: "original-id", function: { name: "f", arguments: "" } }],
    );
    const result = accumulateToolCalls(initial, [
      { index: 0, id: "", function: { arguments: "more" } },
    ]);
    assert.strictEqual(result[0]!.id, "original-id");
  });

  it("backfills id from later delta when existing id is empty", () => {
    const initial = accumulateToolCalls(
      [],
      [{ index: 0, function: { name: "f", arguments: "" } }],
    );
    const result = accumulateToolCalls(initial, [
      { index: 0, id: "later-id", function: { arguments: "args" } },
    ]);
    assert.strictEqual(result[0]!.id, "later-id");
  });

  it("delta with name overwrites existing name", () => {
    const initial = accumulateToolCalls(
      [],
      [{ index: 0, id: "tc1", function: { name: "original", arguments: "" } }],
    );
    const result = accumulateToolCalls(initial, [
      { index: 0, function: { name: "overwritten", arguments: "" } },
    ]);
    assert.strictEqual(result[0]!.function.name, "overwritten");
  });

  it("delta without name preserves existing name", () => {
    const initial = accumulateToolCalls(
      [],
      [{ index: 0, id: "tc1", function: { name: "keepMe", arguments: "" } }],
    );
    const result = accumulateToolCalls(initial, [
      { index: 0, function: { arguments: "extra" } },
    ]);
    assert.strictEqual(result[0]!.function.name, "keepMe");
  });
});

describe("executeToolCalls", () => {
  function runFuture<L, R>(fut: FutureInstance<L, R>): Promise<R> {
    return new Promise((res, rej) => {
      fut.pipe(fork(rej)(res));
    });
  }

  it("returns a FutureInstance", () => {
    const accessor = makeEmptyAccessor();
    const result = executeToolCalls(accessor, []);
    assert.ok(isFuture(result));
  });

  it("returns empty array for empty input", async () => {
    const accessor = makeEmptyAccessor();
    const result = await runFuture(executeToolCalls(accessor, []));
    assert.deepStrictEqual(result, []);
  });

  it("produces ToolMessage entries for valid tool calls", async () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "tc1",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "{}" },
      },
    ];
    const result = await runFuture(
      executeToolCalls(accessor, toolCalls, () => "fixed-id"),
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.role, "tool");
  });

  it("each result includes correct tool_call_id", async () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "my-call-id",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "{}" },
      },
    ];
    const result = await runFuture(
      executeToolCalls(accessor, toolCalls, () => "fixed-id"),
    );
    assert.strictEqual(result[0]!.tool_call_id, "my-call-id");
  });

  it("result content is JSON-serialized tool output", async () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "tc1",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "{}" },
      },
    ];
    const result = await runFuture(
      executeToolCalls(accessor, toolCalls, () => "fixed-id"),
    );
    const parsed = JSON.parse(result[0]!.content as string) as {
      durationMs: number;
    };
    assert.strictEqual(parsed.durationMs, 0);
  });

  it("malformed JSON arguments produce error message", async () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "tc1",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "not-json" },
      },
    ];
    const result = await runFuture(
      executeToolCalls(accessor, toolCalls, () => "fixed-id"),
    );
    const parsed = JSON.parse(result[0]!.content as string) as {
      error: string;
    };
    assert.ok(typeof parsed.error === "string");
  });

  it("unknown tool name produces error message", async () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "tc1",
        index: 0,
        function: { name: "nonExistentTool", arguments: "{}" },
      },
    ];
    const result = await runFuture(
      executeToolCalls(accessor, toolCalls, () => "fixed-id"),
    );
    const parsed = JSON.parse(result[0]!.content as string) as {
      error: string;
    };
    assert.ok(parsed.error.includes("nonExistentTool"));
  });

  it("empty arguments string treated as empty object", async () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "tc1",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "" },
      },
    ];
    const result = await runFuture(
      executeToolCalls(accessor, toolCalls, () => "fixed-id"),
    );
    assert.strictEqual(result.length, 1);
    const parsed = JSON.parse(result[0]!.content as string) as {
      durationMs: number;
    };
    assert.strictEqual(parsed.durationMs, 0);
  });

  it("filters out falsy entries in sparse array", async () => {
    const accessor = makeEmptyAccessor();
    const sparse = [] as Array<ToolCall>;
    sparse[2] = {
      id: "tc2",
      index: 2,
      function: { name: "getRecordingDuration", arguments: "{}" },
    };
    const result = await runFuture(
      executeToolCalls(accessor, sparse, () => "fixed-id"),
    );
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.tool_call_id, "tc2");
  });

  it("resolves Future tool handlers before serializing result", async () => {
    const accessor = makeEmptyAccessor();
    // getRecordingDuration now returns a Future; verify the resolved value is serialized
    const toolCalls: Array<ToolCall> = [
      {
        id: "async-tc",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "{}" },
      },
    ];
    const result = await runFuture(
      executeToolCalls(accessor, toolCalls, () => "fixed-id"),
    );
    // If the Future were not resolved, content would be "{}" (empty serialized Future object)
    const parsed = JSON.parse(result[0]!.content as string) as {
      durationMs: number;
    };
    assert.strictEqual(typeof parsed.durationMs, "number");
  });

  it("executes multiple tool calls concurrently (all start before any complete)", async () => {
    const accessor = makeEmptyAccessor();
    const startTimes: Array<number> = [];
    const endTimes: Array<number> = [];

    // Inject a custom executeFn that records start/end times and waits briefly
    const delayMs = 50;
    const executeFn = (
      _recording: RecordingDataAccessor,
      _name: string,
      _args: Record<string, unknown>,
    ): FutureInstance<unknown, unknown> => {
      const idx = startTimes.length;
      startTimes.push(Date.now());
      return Future((_, res) => {
        const timer = setTimeout(() => {
          endTimes[idx] = Date.now();
          res({ result: idx });
        }, delayMs);
        return () => clearTimeout(timer);
      });
    };

    const toolCalls: Array<ToolCall> = [
      {
        id: "tc0",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "{}" },
      },
      {
        id: "tc1",
        index: 1,
        function: { name: "getRecordingDuration", arguments: "{}" },
      },
      {
        id: "tc2",
        index: 2,
        function: { name: "getRecordingDuration", arguments: "{}" },
      },
    ];

    const wallStart = Date.now();
    const results = await runFuture(
      executeToolCalls(accessor, toolCalls, () => "id", executeFn),
    );
    const wallElapsed = Date.now() - wallStart;

    // All 3 results must be present and preserve original call order
    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0]!.tool_call_id, "tc0");
    assert.strictEqual(results[1]!.tool_call_id, "tc1");
    assert.strictEqual(results[2]!.tool_call_id, "tc2");

    // Serial execution would take >= 3 * delayMs. Concurrent should be ~delayMs.
    // We allow 2.5× to avoid flakiness, but serial (3×) must never pass.
    assert.ok(
      wallElapsed < delayMs * 2.5,
      `Expected concurrent execution (~${delayMs}ms) but took ${wallElapsed}ms (serial would be ~${
        delayMs * 3
      }ms)`,
    );

    // All 3 calls must have started before any completed (overlap in time)
    assert.strictEqual(
      startTimes.length,
      3,
      "Expected all 3 tool calls to have started",
    );

    // The earliest end time must be after all start times (proving concurrent start)
    const earliestEnd = Math.min(
      ...(endTimes.filter((t) => t !== undefined) as Array<number>),
    );
    const latestStart = Math.max(...startTimes);
    assert.ok(
      latestStart < earliestEnd,
      `Expected all calls to start before any completed. latestStart=${latestStart}, earliestEnd=${earliestEnd}`,
    );
  });
});

describe("buildToolMessageContent", () => {
  it("returns plain JSON string for non-screenshot tool output", () => {
    const output = { durationMs: 1234 };
    const result = buildToolMessageContent("getRecordingDuration", output);
    assert.strictEqual(typeof result, "string");
    assert.strictEqual(result, JSON.stringify(output));
  });

  it("returns vision content blocks when captureScreenshot returns a dataUrl", () => {
    const dataUrl = "data:image/png;base64,abc123";
    const output = { timestampMs: 500, dataUrl };
    const result = buildToolMessageContent("captureScreenshot", output);
    assert.ok(Array.isArray(result));
    const blocks = result as Array<{ type: string }>;
    assert.strictEqual(blocks.length, 2);
    assert.strictEqual(blocks[0]!.type, "text");
    assert.strictEqual(blocks[1]!.type, "image_url");
    const imageBlock = blocks[1] as {
      type: string;
      image_url: { url: string };
    };
    assert.strictEqual(imageBlock.image_url.url, dataUrl);
  });

  it("falls back to plain JSON string when captureScreenshot output has no dataUrl", () => {
    const output = { error: "No snapshot available" };
    const result = buildToolMessageContent("captureScreenshot", output);
    assert.strictEqual(typeof result, "string");
    assert.strictEqual(result, JSON.stringify(output));
  });

  it("falls back to plain JSON string when captureScreenshot dataUrl is not a string", () => {
    const output = { timestampMs: 0, dataUrl: null };
    const result = buildToolMessageContent("captureScreenshot", output);
    assert.strictEqual(typeof result, "string");
  });

  it("text block includes the timestamp for context", () => {
    const dataUrl = "data:image/png;base64,xyz";
    const output = { timestampMs: 1000, dataUrl };
    const result = buildToolMessageContent("captureScreenshot", output);
    assert.ok(Array.isArray(result));
    const textBlock = (result as Array<{ type: string; text?: string }>)[0]!;
    assert.ok(typeof textBlock.text === "string");
    assert.ok(textBlock.text.includes("1000"));
  });
});

describe("MAX_TOOL_ITERATIONS", () => {
  it("is a positive integer of at least 10", () => {
    assert.ok(typeof MAX_TOOL_ITERATIONS === "number");
    assert.ok(Number.isInteger(MAX_TOOL_ITERATIONS));
    assert.ok(MAX_TOOL_ITERATIONS >= 10);
  });

  it("defaults to 25", () => {
    assert.strictEqual(MAX_TOOL_ITERATIONS, 25);
  });
});

describe("buildIterationLimitMessage", () => {
  it("returns an assistant message", () => {
    const msg = buildIterationLimitMessage("fixed-id");
    assert.strictEqual(msg.role, "assistant");
  });

  it("uses the provided id", () => {
    const msg = buildIterationLimitMessage("my-id");
    assert.strictEqual(msg.id, "my-id");
  });

  it("content mentions iteration limit", () => {
    const msg = buildIterationLimitMessage("x");
    assert.ok(msg.content.includes("iteration limit"));
  });

  it("content includes the MAX_TOOL_ITERATIONS count", () => {
    const msg = buildIterationLimitMessage("x");
    assert.ok(msg.content.includes(String(MAX_TOOL_ITERATIONS)));
  });

  it("has empty toolCalls array", () => {
    const msg = buildIterationLimitMessage("x");
    assert.deepStrictEqual(msg.toolCalls, []);
  });
});

function makeEmptyAccessorNew(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => null,
    getEventsByType: () => [],
    getEventsInRange: () => [],
    getResourceMap: () => ({}),
  };
}

function makeMessageEvent(data: string): { data: string } {
  return { data };
}

function makeDeltaEvent(content: string): { data: string } {
  return makeMessageEvent(
    JSON.stringify({
      choices: [{ delta: { content } }],
    }),
  );
}

function makeSseStream(
  events: Array<{ data: string }>,
): ReadableStream<{ data: string }> {
  let index = 0;
  return new ReadableStream<{ data: string }>({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(events[index++]!);
      } else {
        controller.close();
      }
    },
  });
}

function waitForCondition(
  condition: () => boolean,
  timeout = 2000,
): Promise<void> {
  return new Promise((res, rej) => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval);
        res();
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        rej(new Error("Condition timed out"));
      }
    }, 10);
  });
}

describe("createAgenticState — cancel and error handling", () => {
  it("cancel() sets loading to cancelled", async () => {
    const streamProvider: StreamProvider = () =>
      resolve(
        makeSseStream([makeDeltaEvent("partial"), makeMessageEvent("[DONE]")]),
      ) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");
    state.cancel();

    assert.strictEqual(state.$loading.getValue(), "cancelled");

    state.destroy();
  });

  it("cancel() aborts the signal passed to the stream provider", async () => {
    let capturedSignal: AbortSignal | undefined;
    const streamProvider: StreamProvider = (_ctx, _tools, signal) => {
      capturedSignal = signal;
      return resolve(new ReadableStream()) as never;
    };

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => capturedSignal !== undefined);

    assert.ok(capturedSignal !== undefined);
    assert.strictEqual(capturedSignal.aborted, false);

    state.cancel();

    assert.strictEqual(capturedSignal.aborted, true);

    state.destroy();
  });

  it("network error (TypeError) sets $error with retryable=true", async () => {
    const networkError = new TypeError("Failed to fetch");
    const streamProvider: StreamProvider = () =>
      futureReject(networkError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 10000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.retryable, true);

    state.destroy();
  });

  it("HTTP 500 sets $error with retryable=false and loading to none", async () => {
    const httpError = { status: 500, statusText: "Internal Server Error" };
    const streamProvider: StreamProvider = () =>
      futureReject(httpError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 5000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.retryable, false);
    assert.strictEqual(state.$loading.getValue(), "none");

    state.destroy();
  });

  it("HTTP 401 sets $error with retryable=false", async () => {
    const httpError = { status: 401, statusText: "Unauthorized" };
    const streamProvider: StreamProvider = () =>
      futureReject(httpError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 5000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.retryable, false);

    state.destroy();
  });

  it("new query() clears $error", async () => {
    const httpError = { status: 500, statusText: "Internal Server Error" };
    let callCount = 0;
    const streamProvider: StreamProvider = () => {
      callCount++;
      if (callCount === 1) {
        return futureReject(httpError) as never;
      }
      return resolve(new ReadableStream()) as never;
    };

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("first");

    await waitForCondition(() => state.$error.getValue() !== null, 5000);
    assert.ok(state.$error.getValue() !== null);

    state.query("second");

    assert.strictEqual(state.$error.getValue(), null);

    state.destroy();
  });

  it("cancel() when no in-flight request still sets loading to cancelled", () => {
    const streamProvider: StreamProvider = () =>
      resolve(new ReadableStream()) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.cancel();

    assert.strictEqual(state.$loading.getValue(), "cancelled");

    state.destroy();
  });

  it("AbortError from stream is silently swallowed — loading stays cancelled", async () => {
    let resolveAbort!: () => void;
    const abortPromise = new Promise<void>((res) => {
      resolveAbort = res;
    });

    const streamProvider: StreamProvider = (_ctx, _tools, signal) => {
      if (signal) {
        signal.addEventListener("abort", () => resolveAbort());
      }
      return resolve(new ReadableStream()) as never;
    };

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");
    state.cancel();

    await abortPromise;

    assert.strictEqual(state.$loading.getValue(), "cancelled");
    assert.strictEqual(state.$error.getValue(), null);

    state.destroy();
  });

  it("HTTP 429 is retryable and sets $error after exhausting retries", async () => {
    const rateLimitError = { status: 429 };
    let callCount = 0;
    const streamProvider: StreamProvider = () => {
      callCount++;
      return futureReject(rateLimitError) as never;
    };

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 10000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.retryable, true);
    assert.ok(callCount >= 3);

    state.destroy();
  });

  it("HTTP 503 is retryable and sets $error after exhausting retries", async () => {
    const serviceUnavailableError = { status: 503 };
    const streamProvider: StreamProvider = () =>
      futureReject(serviceUnavailableError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 10000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.retryable, true);

    state.destroy();
  });

  it("HTTP 408 is retryable and sets $error after exhausting retries", async () => {
    const timeoutError = { status: 408 };
    const streamProvider: StreamProvider = () =>
      futureReject(timeoutError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 10000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.retryable, true);

    state.destroy();
  });

  it("HTTP 403 sets $error with retryable=false and message 'Access denied.'", async () => {
    const forbiddenError = { status: 403 };
    const streamProvider: StreamProvider = () =>
      futureReject(forbiddenError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 5000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.retryable, false);
    assert.strictEqual(error.message, "Access denied.");

    state.destroy();
  });

  it("HTTP 401 sets friendly authentication-failed message", async () => {
    const authError = { status: 401 };
    const streamProvider: StreamProvider = () =>
      futureReject(authError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 5000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(
      error.message,
      "Authentication failed. Please refresh and try again.",
    );

    state.destroy();
  });

  it("HTTP 500 sets server-error message", async () => {
    const serverError = { status: 500 };
    const streamProvider: StreamProvider = () =>
      futureReject(serverError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 5000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.message, "Server error. Please try again.");

    state.destroy();
  });

  it("network error sets generic fallback message", async () => {
    const networkError = new TypeError("Failed to fetch");
    const streamProvider: StreamProvider = () =>
      futureReject(networkError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 10000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(
      error.message,
      "Something went wrong. Please try again.",
    );

    state.destroy();
  });

  it("$error.attempt is 0 for first immediate non-retryable failure", async () => {
    const httpError = { status: 500 };
    const streamProvider: StreamProvider = () =>
      futureReject(httpError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 5000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.attempt, 0);

    state.destroy();
  });

  it("$error.attempt records retryAttempt at time of final failure (should be 2 for 429 after 3 tries)", async () => {
    const rateLimitError = { status: 429 };
    const streamProvider: StreamProvider = () =>
      futureReject(rateLimitError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 10000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.attempt, 2);

    state.destroy();
  });

  it("destroy() aborts in-flight work", async () => {
    let capturedSignal: AbortSignal | undefined;
    const streamProvider: StreamProvider = (_ctx, _tools, signal) => {
      capturedSignal = signal;
      return resolve(new ReadableStream()) as never;
    };

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => capturedSignal !== undefined);

    assert.strictEqual(capturedSignal!.aborted, false);

    state.destroy();

    assert.strictEqual(capturedSignal!.aborted, true);
  });

  it("successful completion sets loading to none and $error stays null", async () => {
    const stream = makeSseStream([
      makeDeltaEvent("response text"),
      makeMessageEvent("[DONE]"),
    ]);
    const streamProvider: StreamProvider = () => resolve(stream) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$loading.getValue() === "none", 5000);

    assert.strictEqual(state.$loading.getValue(), "none");
    assert.strictEqual(state.$error.getValue(), null);

    state.destroy();
  });

  it('HTTP 429 final failure sets try-again message (not "Retrying...")', async () => {
    const rateLimitError = { status: 429 };
    const streamProvider: StreamProvider = () =>
      futureReject(rateLimitError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 10000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.message, "Rate limit reached. Please try again.");

    state.destroy();
  });

  it('HTTP 503 final failure sets try-again message (not "Retrying...")', async () => {
    const serviceUnavailableError = { status: 503 };
    const streamProvider: StreamProvider = () =>
      futureReject(serviceUnavailableError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => state.$error.getValue() !== null, 10000);

    const error = state.$error.getValue();
    assert.ok(error !== null);
    assert.strictEqual(error.message, "Connection lost. Please try again.");

    state.destroy();
  });

  it("cancel() while retry is pending does not trigger another request", async () => {
    const rateLimitError = { status: 429 };
    let callCount = 0;
    const streamProvider: StreamProvider = () => {
      callCount++;
      return futureReject(rateLimitError) as never;
    };

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    await waitForCondition(() => callCount >= 1);

    state.cancel();

    const countAfterCancel = callCount;

    // Wait long enough for the cancelled→none transition (1500ms) to have fired
    await new Promise((res) => setTimeout(res, 2000));

    assert.strictEqual(callCount, countAfterCancel);
    // After the transition delay, loading should be back to 'none'
    assert.strictEqual(state.$loading.getValue(), "none");

    state.destroy();
  });

  it("cancel() transitions loading from 'cancelled' to 'none' after ~1500ms", async () => {
    const streamProvider: StreamProvider = () =>
      resolve(new ReadableStream()) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");
    state.cancel();

    // Immediately after cancel(), loading should be 'cancelled'
    assert.strictEqual(state.$loading.getValue(), "cancelled");

    // After ~1500ms, loading should reset to 'none'
    await waitForCondition(() => state.$loading.getValue() === "none", 3000);
    assert.strictEqual(state.$loading.getValue(), "none");

    state.destroy();
  });

  it("cancel() while streaming does not let subsequent stream chunks revert loading to 'responding'", async () => {
    // A slow SSE stream that pauses between events via a promise
    let releasePull!: () => void;
    let pullCount = 0;
    const events = [
      makeDeltaEvent("chunk1"),
      makeDeltaEvent("chunk2"),
      makeMessageEvent("[DONE]"),
    ];
    let eventIndex = 0;

    const slowStream = new ReadableStream<{ data: string }>({
      pull(controller) {
        pullCount++;
        // Pause after the first pull so we can cancel mid-stream
        return new Promise<void>((res) => {
          releasePull = res;
          // Auto-release after a short delay to avoid test hanging
          setTimeout(() => {
            if (eventIndex < events.length) {
              controller.enqueue(events[eventIndex++]!);
            } else {
              controller.close();
            }
            res();
          }, 50);
        });
      },
    });

    const streamProvider: StreamProvider = () => resolve(slowStream) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    // Wait for the pull function to be called at least once (stream started)
    await waitForCondition(() => pullCount >= 1);

    state.cancel();

    // Immediately after cancel, loading must be 'cancelled'
    assert.strictEqual(state.$loading.getValue(), "cancelled");

    // Release the paused pull so any pending chunks can arrive
    if (releasePull) releasePull();

    // Wait 100ms for any async events to process
    await new Promise((res) => setTimeout(res, 100));

    // Loading must still be 'cancelled' — not reverted to 'responding'
    assert.strictEqual(state.$loading.getValue(), "cancelled");

    state.destroy();
  });

  it("cancel() during tool-executing stops tool calls and does not trigger a new LLM request", async () => {
    // Build an SSE event that carries a tool call (no content — assistant requests a tool)
    const toolCallEvent = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "tc1",
                function: { name: "getRecordingDuration", arguments: "{}" },
              },
            ],
          },
        },
      ],
    });

    // Block the second LLM request indefinitely so we can detect if it fires at all
    let streamCallCount = 0;
    const streamProvider: StreamProvider = () => {
      streamCallCount++;
      if (streamCallCount === 1) {
        // First call: return a tool-call completion stream
        return resolve(
          new ReadableStream<{ data: string }>({
            start(controller) {
              controller.enqueue({ data: toolCallEvent });
              controller.enqueue({ data: "[DONE]" });
              controller.close();
            },
          }),
        ) as never;
      }
      // Any subsequent call: return a stream that never emits, so we can detect
      // that it was triggered at all
      return resolve(new ReadableStream()) as never;
    };

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    // Wait until the first LLM request has been initiated (streamCallCount >= 1)
    // and the stream has had time to process its events asynchronously
    await waitForCondition(() => streamCallCount >= 1);

    // Give the stream a tick to process its events (tool_calls + [DONE])
    await new Promise((res) => setTimeout(res, 50));

    // Now cancel — at this point the tool Future may or may not have run.
    // The key invariant: after cancel(), no *new* LLM request should fire.
    state.cancel();

    const countAtCancel = streamCallCount;

    // Wait long enough for any async tool completion and toolCallTrigger to fire
    await new Promise((res) => setTimeout(res, 500));

    // No new LLM request should have been triggered after cancel()
    assert.strictEqual(
      streamCallCount,
      countAtCancel,
      `Expected no new LLM request after cancel(), but streamCallCount went from ${countAtCancel} to ${streamCallCount}`,
    );

    // Loading must not be in an active state — must be 'cancelled' or 'none'
    const loadingVal = state.$loading.getValue();
    assert.ok(
      loadingVal === "cancelled" || loadingVal === "none",
      `Expected loading to be 'cancelled' or 'none', got '${loadingVal}'`,
    );

    state.destroy();
  });

  it("cancel() is idempotent — calling it twice does not throw", () => {
    const streamProvider: StreamProvider = () =>
      resolve(new ReadableStream()) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    // First cancel: sets currentAbortController to null and flags cancelled
    assert.doesNotThrow(() => state.cancel());
    // Second cancel: currentAbortController is already null — must not throw
    assert.doesNotThrow(() => state.cancel());

    assert.strictEqual(state.$loading.getValue(), "cancelled");

    state.destroy();
  });

  it("query() after cancel() resets cancelled flag so new stream chunks update loading normally", async () => {
    // First query: cancel it immediately
    const streamProvider: StreamProvider = () =>
      resolve(new ReadableStream()) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("first");
    state.cancel();

    assert.strictEqual(state.$loading.getValue(), "cancelled");

    // Second query: cancelled flag must be cleared so the stream can set loading
    // to 'responding' when message content arrives
    const secondStreamProvider: StreamProvider = () =>
      // Return a stream that yields a content chunk then done
      resolve(
        makeSseStream([makeDeltaEvent("hello"), makeMessageEvent("[DONE]")]),
      ) as never;

    // We need a new state instance because the stream provider is captured at
    // construction time — but we can verify the same behaviour inline by
    // re-issuing query() on the same state after cancelling.
    const state2 = createAgenticState(
      secondStreamProvider,
      makeEmptyAccessorNew(),
    );
    state2.query("first");
    state2.cancel();
    // Now query again — cancelled must be cleared
    state2.query("second");

    // Wait for loading to reach 'none' (successful completion)
    await waitForCondition(() => state2.$loading.getValue() === "none", 5000);
    assert.strictEqual(state2.$loading.getValue(), "none");

    state.destroy();
    state2.destroy();
  });

  it("cancelled flag does not block setEntryMap() — message content accumulates after cancel", async () => {
    // Build a stream that delivers a content chunk AFTER we cancel.
    // We pause the stream using a promise, cancel, then let it proceed.
    let releaseChunk!: () => void;
    const chunkReleased = new Promise<void>((res) => {
      releaseChunk = res;
    });

    let streamStarted = false;
    const slowStream = new ReadableStream<{ data: string }>({
      async pull(controller) {
        streamStarted = true;
        // Block until we release
        await chunkReleased;
        controller.enqueue(makeDeltaEvent("content after cancel"));
        controller.enqueue(makeMessageEvent("[DONE]"));
        controller.close();
      },
    });

    const streamProvider: StreamProvider = () => resolve(slowStream) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    // Wait until the stream pull has been invoked
    await waitForCondition(() => streamStarted);

    state.cancel();

    // Release the stream — chunk arrives after cancel
    releaseChunk();

    // Give RxJS time to process the chunk
    await new Promise((res) => setTimeout(res, 150));

    // The assistant entry should have been written (setEntryMap is not guarded)
    const entries = state.$entries.getValue();
    const assistantEntries = entries.filter((e) => e.role === "assistant");
    assert.ok(
      assistantEntries.length > 0,
      "Expected at least one assistant entry even though cancelled",
    );

    // But loading must NOT have been set to 'responding' — it stays 'cancelled'
    // (or 'none' after the 1500ms timeout, but 150ms have not elapsed that long)
    const loading = state.$loading.getValue();
    assert.ok(
      loading === "cancelled" || loading === "none",
      `Expected loading to remain 'cancelled', got '${loading}'`,
    );

    state.destroy();
  });

  it("destroy() cleans up currentToolSubscription", async () => {
    // Build a stream that triggers a tool call, then destroy before the
    // tool Future settles — the subscription should be unsubscribed without error.
    const toolCallEvent = JSON.stringify({
      choices: [
        {
          delta: {
            tool_calls: [
              {
                index: 0,
                id: "tc1",
                function: { name: "getRecordingDuration", arguments: "{}" },
              },
            ],
          },
        },
      ],
    });

    let streamCallCount = 0;
    const streamProvider: StreamProvider = () => {
      streamCallCount++;
      if (streamCallCount === 1) {
        return resolve(
          new ReadableStream<{ data: string }>({
            start(controller) {
              controller.enqueue({ data: toolCallEvent });
              controller.enqueue({ data: "[DONE]" });
              controller.close();
            },
          }),
        ) as never;
      }
      // Subsequent calls: never-ending stream (should not be reached)
      return resolve(new ReadableStream()) as never;
    };

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("hello");

    // Wait until the first stream has been consumed (tool-executing state)
    await waitForCondition(
      () =>
        state.$loading.getValue() === "tool-executing" || streamCallCount >= 1,
      5000,
    );

    // Give the Future a tick to start executing (but not necessarily finish)
    await new Promise((res) => setTimeout(res, 10));

    // destroy() must not throw even if currentToolSubscription is set
    assert.doesNotThrow(() => state.destroy());
  });
});

describe("reset()", () => {
  function makeEmptyAccessorNew(): RecordingDataAccessor {
    return {
      getDuration: () => 0,
      getSnapshotAtTime: () => null,
      getEventsByType: () => [],
      getEventsInRange: () => [],
      getResourceMap: () => ({}),
    };
  }

  function waitForCondition(
    predicate: () => boolean,
    timeout = 5000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      function check() {
        if (predicate()) return resolve();
        if (Date.now() - start > timeout) return reject(new Error("timeout"));
        setTimeout(check, 10);
      }
      check();
    });
  }

  function makeSseStream(
    events: Array<{ data: string }>,
  ): ReadableStream<{ data: string }> {
    return new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(event);
        }
        controller.close();
      },
    });
  }

  function makeDeltaEvent(content: string): { data: string } {
    return {
      data: JSON.stringify({
        choices: [{ delta: { content } }],
      }),
    };
  }

  function makeMessageEvent(data: string): { data: string } {
    return { data };
  }

  it("reset() clears all entries", async () => {
    const stream = makeSseStream([
      makeDeltaEvent("hello"),
      makeMessageEvent("[DONE]"),
    ]);
    const streamProvider: StreamProvider = () => resolve(stream) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("test");

    await waitForCondition(() => state.$entries.getValue().length > 0);

    state.reset();

    assert.deepStrictEqual(state.$entries.getValue(), []);
    state.destroy();
  });

  it("reset() sets $loading to 'none'", () => {
    const streamProvider: StreamProvider = () => new Promise(() => {}) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("test");

    state.reset();

    assert.strictEqual(state.$loading.getValue(), "none");
    state.destroy();
  });

  it("reset() clears $error", async () => {
    const forbiddenError = { status: 403 };
    const streamProvider: StreamProvider = () =>
      futureReject(forbiddenError) as never;

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("test");

    await waitForCondition(() => state.$error.getValue() !== null, 5000);

    state.reset();

    assert.strictEqual(state.$error.getValue(), null);
    state.destroy();
  });

  it("reset() aborts any in-flight request", async () => {
    let aborted = false;
    const streamProvider: StreamProvider = (_ctx, _tools, signal) => {
      if (signal) {
        signal.addEventListener("abort", () => {
          aborted = true;
        });
      }
      return resolve(new ReadableStream()) as never;
    };

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew());
    state.query("test");
    state.reset();

    await new Promise((res) => setTimeout(res, 50));

    assert.strictEqual(aborted, true);
    state.destroy();
  });
});
