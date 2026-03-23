import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  MAX_TOOL_ITERATIONS,
  accumulateToolCalls,
  buildIterationLimitMessage,
  createAgenticState,
  executeToolCalls,
  isValidMessageDelta,
} from './createState'
import { RecordingDataAccessor, StreamProvider, ToolCall } from './types'
import { resolve, reject as futureReject } from 'fluture'

function makeEmptyAccessor(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => null,
    getEventsByType: () => [],
    getEventsInRange: () => [],
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
  it("returns empty array for empty input", () => {
    const accessor = makeEmptyAccessor();
    const result = executeToolCalls(accessor, []);
    assert.deepStrictEqual(result, []);
  });

  it("produces ToolMessage entries for valid tool calls", () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "tc1",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "{}" },
      },
    ];
    const result = executeToolCalls(accessor, toolCalls, () => "fixed-id");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.role, "tool");
  });

  it("each result includes correct tool_call_id", () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "my-call-id",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "{}" },
      },
    ];
    const result = executeToolCalls(accessor, toolCalls, () => "fixed-id");
    assert.strictEqual(result[0]!.tool_call_id, "my-call-id");
  });

  it("result content is JSON-serialized tool output", () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "tc1",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "{}" },
      },
    ];
    const result = executeToolCalls(accessor, toolCalls, () => "fixed-id");
    const parsed = JSON.parse(result[0]!.content) as { durationMs: number };
    assert.strictEqual(parsed.durationMs, 0);
  });

  it("malformed JSON arguments produce error message", () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "tc1",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "not-json" },
      },
    ];
    const result = executeToolCalls(accessor, toolCalls, () => "fixed-id");
    const parsed = JSON.parse(result[0]!.content) as { error: string };
    assert.ok(typeof parsed.error === "string");
  });

  it("unknown tool name produces error message", () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "tc1",
        index: 0,
        function: { name: "nonExistentTool", arguments: "{}" },
      },
    ];
    const result = executeToolCalls(accessor, toolCalls, () => "fixed-id");
    const parsed = JSON.parse(result[0]!.content) as { error: string };
    assert.ok(parsed.error.includes("nonExistentTool"));
  });

  it("empty arguments string treated as empty object", () => {
    const accessor = makeEmptyAccessor();
    const toolCalls: Array<ToolCall> = [
      {
        id: "tc1",
        index: 0,
        function: { name: "getRecordingDuration", arguments: "" },
      },
    ];
    const result = executeToolCalls(accessor, toolCalls, () => "fixed-id");
    assert.strictEqual(result.length, 1);
    const parsed = JSON.parse(result[0]!.content) as { durationMs: number };
    assert.strictEqual(parsed.durationMs, 0);
  });

  it("filters out falsy entries in sparse array", () => {
    const accessor = makeEmptyAccessor();
    const sparse = [] as Array<ToolCall>;
    sparse[2] = {
      id: "tc2",
      index: 2,
      function: { name: "getRecordingDuration", arguments: "{}" },
    };
    const result = executeToolCalls(accessor, sparse, () => "fixed-id");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]!.tool_call_id, "tc2");
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
  }
}

function makeMessageEvent(data: string): { data: string } {
  return { data }
}

function makeDeltaEvent(content: string): { data: string } {
  return makeMessageEvent(
    JSON.stringify({
      choices: [{ delta: { content } }],
    })
  )
}

function makeSseStream(
  events: Array<{ data: string }>
): ReadableStream<{ data: string }> {
  let index = 0
  return new ReadableStream<{ data: string }>({
    pull(controller) {
      if (index < events.length) {
        controller.enqueue(events[index++]!)
      } else {
        controller.close()
      }
    },
  })
}

function waitForCondition(
  condition: () => boolean,
  timeout = 2000
): Promise<void> {
  return new Promise((res, rej) => {
    const start = Date.now()
    const interval = setInterval(() => {
      if (condition()) {
        clearInterval(interval)
        res()
      } else if (Date.now() - start > timeout) {
        clearInterval(interval)
        rej(new Error('Condition timed out'))
      }
    }, 10)
  })
}

describe('createAgenticState — cancel and error handling', () => {
  it('cancel() sets loading to cancelled', async () => {
    const streamProvider: StreamProvider = () =>
      resolve(makeSseStream([makeDeltaEvent('partial'), makeMessageEvent('[DONE]')])) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')
    state.cancel()

    assert.strictEqual(state.$loading.getValue(), 'cancelled')

    state.destroy()
  })

  it('cancel() aborts the signal passed to the stream provider', async () => {
    let capturedSignal: AbortSignal | undefined
    const streamProvider: StreamProvider = (_ctx, _tools, signal) => {
      capturedSignal = signal
      return resolve(new ReadableStream()) as never
    }

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => capturedSignal !== undefined)

    assert.ok(capturedSignal !== undefined)
    assert.strictEqual(capturedSignal.aborted, false)

    state.cancel()

    assert.strictEqual(capturedSignal.aborted, true)

    state.destroy()
  })

  it('network error (TypeError) sets $error with retryable=true', async () => {
    const networkError = new TypeError('Failed to fetch')
    const streamProvider: StreamProvider = () => futureReject(networkError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 10000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.retryable, true)

    state.destroy()
  })

  it('HTTP 500 sets $error with retryable=false and loading to none', async () => {
    const httpError = { status: 500, statusText: 'Internal Server Error' }
    const streamProvider: StreamProvider = () => futureReject(httpError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 5000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.retryable, false)
    assert.strictEqual(state.$loading.getValue(), 'none')

    state.destroy()
  })

  it('HTTP 401 sets $error with retryable=false', async () => {
    const httpError = { status: 401, statusText: 'Unauthorized' }
    const streamProvider: StreamProvider = () => futureReject(httpError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 5000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.retryable, false)

    state.destroy()
  })

  it('new query() clears $error', async () => {
    const httpError = { status: 500, statusText: 'Internal Server Error' }
    let callCount = 0
    const streamProvider: StreamProvider = () => {
      callCount++
      if (callCount === 1) {
        return futureReject(httpError) as never
      }
      return resolve(new ReadableStream()) as never
    }

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('first')

    await waitForCondition(() => state.$error.getValue() !== null, 5000)
    assert.ok(state.$error.getValue() !== null)

    state.query('second')

    assert.strictEqual(state.$error.getValue(), null)

    state.destroy()
  })

  it('cancel() when no in-flight request still sets loading to cancelled', () => {
    const streamProvider: StreamProvider = () =>
      resolve(new ReadableStream()) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.cancel()

    assert.strictEqual(state.$loading.getValue(), 'cancelled')

    state.destroy()
  })

  it('AbortError from stream is silently swallowed — loading stays cancelled', async () => {
    let resolveAbort!: () => void
    const abortPromise = new Promise<void>(res => {
      resolveAbort = res
    })

    const streamProvider: StreamProvider = (_ctx, _tools, signal) => {
      if (signal) {
        signal.addEventListener('abort', () => resolveAbort())
      }
      return resolve(new ReadableStream()) as never
    }

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')
    state.cancel()

    await abortPromise

    assert.strictEqual(state.$loading.getValue(), 'cancelled')
    assert.strictEqual(state.$error.getValue(), null)

    state.destroy()
  })

  it('HTTP 429 is retryable and sets $error after exhausting retries', async () => {
    const rateLimitError = { status: 429 }
    let callCount = 0
    const streamProvider: StreamProvider = () => {
      callCount++
      return futureReject(rateLimitError) as never
    }

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 10000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.retryable, true)
    assert.ok(callCount >= 3)

    state.destroy()
  })

  it('HTTP 503 is retryable and sets $error after exhausting retries', async () => {
    const serviceUnavailableError = { status: 503 }
    const streamProvider: StreamProvider = () =>
      futureReject(serviceUnavailableError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 10000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.retryable, true)

    state.destroy()
  })

  it('HTTP 408 is retryable and sets $error after exhausting retries', async () => {
    const timeoutError = { status: 408 }
    const streamProvider: StreamProvider = () =>
      futureReject(timeoutError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 10000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.retryable, true)

    state.destroy()
  })

  it('HTTP 403 sets $error with retryable=false and message \'Access denied.\'', async () => {
    const forbiddenError = { status: 403 }
    const streamProvider: StreamProvider = () =>
      futureReject(forbiddenError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 5000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.retryable, false)
    assert.strictEqual(error.message, 'Access denied.')

    state.destroy()
  })

  it('HTTP 401 sets friendly authentication-failed message', async () => {
    const authError = { status: 401 }
    const streamProvider: StreamProvider = () =>
      futureReject(authError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 5000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.message, 'Authentication failed. Please refresh and try again.')

    state.destroy()
  })

  it('HTTP 500 sets server-error message', async () => {
    const serverError = { status: 500 }
    const streamProvider: StreamProvider = () =>
      futureReject(serverError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 5000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.message, 'Server error. Please try again.')

    state.destroy()
  })

  it('network error sets generic fallback message', async () => {
    const networkError = new TypeError('Failed to fetch')
    const streamProvider: StreamProvider = () =>
      futureReject(networkError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 10000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.message, 'Something went wrong. Please try again.')

    state.destroy()
  })

  it('$error.attempt is 0 for first immediate non-retryable failure', async () => {
    const httpError = { status: 500 }
    const streamProvider: StreamProvider = () =>
      futureReject(httpError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 5000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.attempt, 0)

    state.destroy()
  })

  it('$error.attempt records retryAttempt at time of final failure (should be 2 for 429 after 3 tries)', async () => {
    const rateLimitError = { status: 429 }
    const streamProvider: StreamProvider = () =>
      futureReject(rateLimitError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 10000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.attempt, 2)

    state.destroy()
  })

  it('destroy() aborts in-flight work', async () => {
    let capturedSignal: AbortSignal | undefined
    const streamProvider: StreamProvider = (_ctx, _tools, signal) => {
      capturedSignal = signal
      return resolve(new ReadableStream()) as never
    }

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => capturedSignal !== undefined)

    assert.strictEqual(capturedSignal!.aborted, false)

    state.destroy()

    assert.strictEqual(capturedSignal!.aborted, true)
  })

  it('successful completion sets loading to none and $error stays null', async () => {
    const stream = makeSseStream([makeDeltaEvent('response text'), makeMessageEvent('[DONE]')])
    const streamProvider: StreamProvider = () => resolve(stream) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$loading.getValue() === 'none', 5000)

    assert.strictEqual(state.$loading.getValue(), 'none')
    assert.strictEqual(state.$error.getValue(), null)

    state.destroy()
  })

  it('HTTP 429 final failure sets try-again message (not "Retrying...")', async () => {
    const rateLimitError = { status: 429 }
    const streamProvider: StreamProvider = () =>
      futureReject(rateLimitError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 10000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.message, 'Rate limit reached. Please try again.')

    state.destroy()
  })

  it('HTTP 503 final failure sets try-again message (not "Retrying...")', async () => {
    const serviceUnavailableError = { status: 503 }
    const streamProvider: StreamProvider = () =>
      futureReject(serviceUnavailableError) as never

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => state.$error.getValue() !== null, 10000)

    const error = state.$error.getValue()
    assert.ok(error !== null)
    assert.strictEqual(error.message, 'Connection lost. Please try again.')

    state.destroy()
  })

  it('cancel() while retry is pending does not trigger another request', async () => {
    const rateLimitError = { status: 429 }
    let callCount = 0
    const streamProvider: StreamProvider = () => {
      callCount++
      return futureReject(rateLimitError) as never
    }

    const state = createAgenticState(streamProvider, makeEmptyAccessorNew())
    state.query('hello')

    await waitForCondition(() => callCount >= 1)

    state.cancel()

    const countAfterCancel = callCount

    await new Promise(res => setTimeout(res, 1500))

    assert.strictEqual(callCount, countAfterCancel)
    assert.strictEqual(state.$loading.getValue(), 'cancelled')

    state.destroy()
  })
})
