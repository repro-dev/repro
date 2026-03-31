import { atom, createAtom } from "@repro/atom";
import { observeFuture } from "@repro/future-utils";
import { randomString } from "@repro/random-string";
import { AGENTIC_DEFAULT_MODEL } from "@repro/domain";
import { FutureInstance, map as mapFuture, parallel, resolve } from "fluture";
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  endWith,
  filter,
  from,
  map,
  merge,
  ReadableStreamLike,
  scan,
  Subject,
  Subscription,
  switchMap,
  takeWhile,
  withLatestFrom,
} from "rxjs";
import {
  computeContextBudget,
  truncateToContextBudget,
} from "./model/context-window";
import { SYSTEM_CARD_MESSAGE } from "./model/system";
import { estimateTokens } from "./model/token-optimization";
import { executeTool, tools } from "./model/tools/index";
import {
  AgenticError,
  AgenticState,
  AssistantMessage,
  ContentBlock,
  Context,
  Entry,
  Loading,
  RecordingDataAccessor,
  StreamProvider,
  ToolCall,
  ToolDefinition,
  ToolMessage,
} from "./types";

interface OrderedEntryMap {
  orderedIds: Array<string>;
  entries: Record<string, Entry>;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface MessageDeltaLike {
  choices: [
    {
      delta: {
        content?: string;
        reasoning?: string;
        tool_calls?: Array<ToolCallDelta>;
      };
    },
  ];
}

interface MessageChunk {
  type: "message";
  data: AssistantMessage;
}

interface CompletionChunk {
  type: "completion";
}

type Chunk = MessageChunk | CompletionChunk;

// Use the canonical default from @repro/domain so the model choice is
// maintained in one place alongside all other MODEL_CONFIGS entries.
const AGENTIC_MODEL = AGENTIC_DEFAULT_MODEL;

function createEntryId() {
  return randomString(5);
}

function safeParse(data: unknown) {
  try {
    return JSON.parse(data as string);
  } catch {
    return data;
  }
}

// Builds the content for a ToolMessage. For captureScreenshot results that
// include a dataUrl, returns an array of vision content blocks so the LLM
// can actually see the image. Falls back to plain JSON string for all other
// tools and for screenshot results where the dataUrl is missing/invalid.
export function buildToolMessageContent(
  toolName: string,
  output: unknown,
): string | Array<ContentBlock> {
  if (
    toolName === "captureScreenshot" &&
    output !== null &&
    typeof output === "object" &&
    "dataUrl" in output &&
    typeof (output as Record<string, unknown>).dataUrl === "string"
  ) {
    const { timestampMs, dataUrl } = output as {
      timestampMs?: number;
      dataUrl: string;
    };
    const timestampLabel =
      timestampMs !== undefined ? ` at ${timestampMs}ms` : "";
    return [
      { type: "text", text: `Screenshot captured${timestampLabel}.` },
      { type: "image_url", image_url: { url: dataUrl } },
    ];
  }

  return JSON.stringify(output);
}

export function isValidMessageDelta(data: any): data is MessageDeltaLike {
  return (
    data != null &&
    typeof data === "object" &&
    "choices" in data &&
    Array.isArray(data.choices) &&
    data.choices[0]?.delta != null
  );
}

export function accumulateToolCalls(
  existing: Array<ToolCall>,
  deltas: Array<ToolCallDelta>,
): Array<ToolCall> {
  const toolCalls = [...existing];

  for (const delta of deltas) {
    const idx = delta.index;
    const current = toolCalls[idx];

    if (current === undefined) {
      toolCalls[idx] = {
        id: delta.id ?? "",
        index: idx,
        function: {
          name: delta.function?.name ?? "",
          arguments: delta.function?.arguments ?? "",
        },
      };
    } else {
      toolCalls[idx] = {
        ...current,
        id: current.id || (delta.id ?? ""),
        function: {
          name: delta.function?.name || current.function.name,
          arguments:
            current.function.arguments + (delta.function?.arguments ?? ""),
        },
      };
    }
  }

  return toolCalls;
}

export function executeToolCalls(
  recording: RecordingDataAccessor,
  toolCalls: Array<ToolCall>,
  createId: () => string = createEntryId,
  executeFn: (
    recording: RecordingDataAccessor,
    name: string,
    args: Record<string, unknown>,
  ) => FutureInstance<unknown, unknown> = executeTool,
): FutureInstance<unknown, Array<ToolMessage>> {
  const denseToolCalls = toolCalls.filter(Boolean);

  if (denseToolCalls.length === 0) {
    return resolve([]);
  }

  // Build one Future per tool call, all starting concurrently via parallel(Infinity).
  // Results arrive in the original call order because fluture's parallel preserves
  // index ordering — the fastest call does not shift its result to index 0.
  const futures = denseToolCalls.map((toolCall) => {
    let toolFut: FutureInstance<unknown, unknown>;
    try {
      const args = toolCall.function.arguments
        ? (JSON.parse(toolCall.function.arguments) as Record<string, unknown>)
        : {};
      toolFut = executeFn(recording, toolCall.function.name, args);
    } catch (err) {
      toolFut = resolve({
        error: err instanceof Error ? err.message : "Tool execution failed",
      });
    }

    return toolFut.pipe(
      mapFuture((output) => {
        const toolMessage: ToolMessage = {
          id: createId(),
          timestamp: new Date(),
          role: "tool",
          content: buildToolMessageContent(toolCall.function.name, output),
          tool_call_id: toolCall.id,
        };
        return toolMessage;
      }),
    );
  });

  // parallel(Infinity) runs all futures at once and resolves with results in
  // the same order as the input array, regardless of completion order.
  return parallel(Infinity)(futures);
}

export const MAX_TOOL_ITERATIONS = 25;

export function buildIterationLimitMessage(id: string): AssistantMessage {
  return {
    id,
    timestamp: new Date(),
    role: "assistant",
    content: `Analysis reached the iteration limit (${MAX_TOOL_ITERATIONS} tool calls). The investigation was cut short — please try a more specific question or review the findings above.`,
    toolCalls: [],
  };
}

function isRetryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return false;
  }
  if (error != null && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    return status === 408 || status === 429 || status === 503;
  }
  return true;
}

function friendlyMessage(error: unknown, isFinal = false): string {
  if (error != null && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    if (status === 401)
      return "Authentication failed. Please refresh and try again.";
    if (status === 403) return "Access denied.";
    if (status === 429)
      return isFinal
        ? "Rate limit reached. Please try again."
        : "Rate limit reached. Retrying...";
    if (status === 503)
      return isFinal
        ? "Connection lost. Please try again."
        : "Connection lost. Retrying...";
    if (status === 500) return "Server error. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

export function createAgenticState(
  streamProvider: StreamProvider,
  recording: RecordingDataAccessor,
  options?: { tools?: ToolDefinition[] },
): AgenticState {
  const [$entryMap, setEntryMap] = createAtom<OrderedEntryMap>({
    orderedIds: [],
    entries: {},
  });

  const [$loading, setLoading] = createAtom<Loading>("none");
  const [$error, setError] = createAtom<AgenticError | null>(null);
  const [$wasCancelled, setWasCancelled] = createAtom<boolean>(false);
  const [$truncatedBefore, setTruncatedBefore] = createAtom<string | null>(
    null,
  );

  let currentAbortController: AbortController | null = null;
  let currentToolSubscription: Subscription | null = null;
  let cancelled = false;
  let retryAttempt = 0;
  let pendingRetryTimer: ReturnType<typeof setTimeout> | null = null;

  const subscription = new Subscription();
  const toolCallTrigger$ = new Subject<void>();
  let iterationCount = 0;

  function clearPendingRetry() {
    if (pendingRetryTimer !== null) {
      clearTimeout(pendingRetryTimer);
      pendingRetryTimer = null;
    }
  }

  function destroy() {
    clearPendingRetry();
    cancelled = true;
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    if (currentToolSubscription) {
      currentToolSubscription.unsubscribe();
      currentToolSubscription = null;
    }
    toolCallTrigger$.complete();
    subscription.unsubscribe();
  }

  function cancel() {
    clearPendingRetry();
    cancelled = true;
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    if (currentToolSubscription) {
      currentToolSubscription.unsubscribe();
      currentToolSubscription = null;
    }
    setWasCancelled(true);
    setLoading("cancelled");
    // Briefly show cancelled state, then reset to idle so the UI unlocks
    setTimeout(() => {
      setLoading("none");
    }, 1500);
  }

  function reset() {
    clearPendingRetry();
    cancelled = false;
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    if (currentToolSubscription) {
      currentToolSubscription.unsubscribe();
      currentToolSubscription = null;
    }
    iterationCount = 0;
    retryAttempt = 0;
    setEntryMap({ orderedIds: [], entries: {} });
    setWasCancelled(false);
    setLoading("none");
    setError(null);
    setTruncatedBefore(null);
  }

  function query(input: string) {
    iterationCount = 0;
    cancelled = false;
    setWasCancelled(false);
    setError(null);
    retryAttempt = 0;
    setLoading("reasoning");

    const id = createEntryId();

    setEntryMap((entryMap) => ({
      orderedIds: [...entryMap.orderedIds, id],
      entries: {
        ...entryMap.entries,
        [id]: {
          id,
          timestamp: new Date(),
          role: "user",
          content: input,
        },
      },
    }));
  }

  function fetchResponse(
    context: Context,
  ): FutureInstance<unknown, ReadableStream<{ data: string }>> {
    currentAbortController = new AbortController();
    const systemTokens = estimateTokens(SYSTEM_CARD_MESSAGE);
    const budget = computeContextBudget(AGENTIC_MODEL, systemTokens);
    const { messages: truncatedContext, droppedCount } =
      truncateToContextBudget(context, budget, (msg) => estimateTokens(msg));

    // Update the truncation indicator atom. When messages were dropped, find
    // the entry ID of the first surviving message so the UI can place the
    // separator precisely. Clear the atom when nothing was dropped.
    const entryMap = $entryMap.getValue();
    if (droppedCount > 0) {
      const firstSurvivingId = entryMap.orderedIds[droppedCount] ?? null;
      setTruncatedBefore(firstSurvivingId);
    } else {
      setTruncatedBefore(null);
    }

    return streamProvider(
      truncatedContext,
      options?.tools ?? tools,
      currentAbortController.signal,
    );
  }

  function appendToolMessage(toolMessage: ToolMessage) {
    setEntryMap((entryMap) => ({
      orderedIds: [...entryMap.orderedIds, toolMessage.id],
      entries: {
        ...entryMap.entries,
        [toolMessage.id]: toolMessage,
      },
    }));
  }

  const entries$ = $entryMap
    .asObservable()
    .pipe(
      map((entryMap) =>
        entryMap.orderedIds
          .map((id) => entryMap.entries[id] ?? null)
          .filter((maybeEntry) => maybeEntry !== null),
      ),
    );

  const modelContext$ = entries$.pipe(
    map<Array<Entry>, Context>((entries) =>
      entries.map<Context[number]>((entry) => {
        switch (entry.role) {
          case "assistant": {
            const ctx: Context[number] = {
              role: entry.role,
              content: entry.content,
            };

            if (entry.toolCalls.length > 0) {
              return {
                ...ctx,
                tool_calls: entry.toolCalls.map((tc) => ({
                  id: tc.id,
                  type: "function" as const,
                  function: tc.function,
                })),
              };
            }

            return ctx;
          }

          case "system":
          case "user":
            return {
              role: entry.role,
              content: entry.content,
            };

          case "tool":
            return {
              role: entry.role,
              tool_call_id: entry.tool_call_id,
              content: entry.content,
            };
        }
      }),
    ),
  );

  const latestEntry$ = $entryMap.asObservable().pipe(
    map((entryMap) => {
      const entryId = entryMap.orderedIds.at(-1) ?? null;

      if (entryId === null) {
        return null;
      }

      return entryMap.entries[entryId] ?? null;
    }),
    distinctUntilChanged(),
  );

  const latestUserEntry$ = latestEntry$.pipe(
    filter((entry) => entry !== null && entry.role === "user"),
  );

  function createResponseStream(context: Context) {
    const responseEntryId = createEntryId();

    const initialMessage: AssistantMessage = {
      id: responseEntryId,
      timestamp: new Date(),
      role: "assistant",
      content: "",
      toolCalls: [],
    };

    const chunks$ = observeFuture(fetchResponse(context)).pipe(
      switchMap((stream) =>
        from(stream as ReadableStreamLike<{ data: string }>),
      ),
      takeWhile((event) => event.data !== "[DONE]"),
      map((event) => safeParse(event.data)),
      filter((data) => isValidMessageDelta(data)),
    );

    return chunks$.pipe(
      scan((message, chunk) => {
        const delta = chunk.choices[0].delta;
        const content = message.content + (delta.content ?? "");
        const toolCalls = delta.tool_calls
          ? accumulateToolCalls(message.toolCalls, delta.tool_calls)
          : message.toolCalls;
        return { ...initialMessage, content, toolCalls };
      }, initialMessage),
      map<AssistantMessage, Chunk>((data) => ({
        type: "message",
        data,
      })),
      endWith<Chunk>({ type: "completion" }),
      catchError((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") {
          return EMPTY;
        }

        const retryable = isRetryable(err);
        const attempt = retryAttempt;

        if (retryable && retryAttempt < 2) {
          retryAttempt++;
          const delay = Math.pow(2, retryAttempt - 1) * 1000;
          pendingRetryTimer = setTimeout(() => {
            pendingRetryTimer = null;
            toolCallTrigger$.next();
          }, delay);
          return EMPTY;
        }

        setLoading("none");
        setError({
          message: friendlyMessage(err, true),
          retryable,
          attempt,
        });
        return EMPTY;
      }),
    );
  }

  const userTriggered$ = latestUserEntry$.pipe(
    distinctUntilChanged(),
    withLatestFrom(modelContext$),
    map(([, context]) => context),
  );

  const toolCallTriggered$ = toolCallTrigger$.pipe(
    withLatestFrom(modelContext$),
    map(([, context]) => context),
  );

  const response$ = merge(userTriggered$, toolCallTriggered$).pipe(
    switchMap((context) => createResponseStream(context)),
  );

  subscription.add(
    response$.subscribe((chunk) => {
      switch (chunk.type) {
        case "message": {
          const message = chunk.data;

          if (!cancelled && message.content !== "") {
            setLoading("responding");
          }

          setEntryMap((entryMap) => {
            return {
              orderedIds: entryMap.entries[message.id]
                ? entryMap.orderedIds
                : [...entryMap.orderedIds, message.id],
              entries: {
                ...entryMap.entries,
                [message.id]: message,
              },
            };
          });

          break;
        }

        case "completion": {
          const entryMap = $entryMap.getValue();
          const lastId = entryMap.orderedIds.at(-1);
          const lastEntry = lastId ? entryMap.entries[lastId] ?? null : null;

          if (
            lastEntry !== null &&
            lastEntry.role === "assistant" &&
            lastEntry.toolCalls.length > 0
          ) {
            iterationCount += 1;

            if (iterationCount >= MAX_TOOL_ITERATIONS) {
              const limitMessage = buildIterationLimitMessage(createEntryId());

              setEntryMap((prev) => ({
                orderedIds: [...prev.orderedIds, limitMessage.id],
                entries: {
                  ...prev.entries,
                  [limitMessage.id]: limitMessage,
                },
              }));

              if (!cancelled) {
                setLoading("none");
              }
              break;
            }

            if (!cancelled) {
              setLoading("tool-executing");
            }

            currentToolSubscription = observeFuture(
              executeToolCalls(recording, lastEntry.toolCalls),
            ).subscribe((toolMessages) => {
              currentToolSubscription = null;
              if (!cancelled) {
                for (const toolMessage of toolMessages) {
                  appendToolMessage(toolMessage);
                }
                setLoading("reasoning");
                toolCallTrigger$.next();
              }
            });
          } else {
            retryAttempt = 0;
            if (!cancelled) {
              setLoading("none");
            }
          }

          break;
        }
      }
    }),
  );

  return {
    $entries: atom.from(entries$, []),
    $loading,
    $error,
    $wasCancelled,
    $truncatedBefore,
    cancel,
    destroy,
    query,
    reset,
  };
}
