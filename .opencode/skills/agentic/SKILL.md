---
name: agentic
description: Architecture, data contracts, tool system, eval harness, and frontend integration for the agentic debugging subsystem. Load when working in packages/agentic, packages/agentic-ui, apps/api-server (agentic routes/services), or apps/capture (Agentic.hoc.tsx).
---

# Agentic Debugging Subsystem

Reference for the agentic AI debugger. Load this skill before implementing anything in `packages/agentic`, `packages/agentic-ui`, or the agentic routes/services in `apps/api-server`.

---

## Package Overview

| Package / Path                                                          | Responsibility                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `packages/agentic`                                                      | State machine, tool definitions, system prompts, context-window management, eval harness                |
| `packages/agentic-ui`                                                   | React components and hooks for rendering the agentic session (message list, tool call rows, input area) |
| `apps/api-server/src/routers/agentic.ts`                                | Fastify routes: `POST /agentic/response` (SSE proxy) and `POST /agentic/feedback`                       |
| `apps/api-server/src/services/agentic.ts`                               | `AgenticService`: forwards requests to OpenRouter, stores feedback in `agentic_feedback` table          |
| `apps/capture/src/components/Widget/ReportForm/Agentic/Agentic.hoc.tsx` | Extension call site: wires `streamProvider`, `RecordingDataAccessor`, and `extensionTools`              |

---

## Core State Machine

### `createAgenticState`

**Location**: `packages/agentic/src/createState.ts`

```ts
createAgenticState(
  streamProvider: StreamProvider,
  recording: RecordingDataAccessor,
  options?: { tools?: ToolDefinition[] },
): AgenticState
```

The single factory for all agentic state. It owns the RxJS/Fluture event loop and exposes:

```ts
interface AgenticState {
  $entries: Atom<Array<Entry>>; // full conversation history
  $loading: Atom<Loading>; // 'reasoning' | 'responding' | 'tool-executing' | 'cancelled' | 'none'
  $error: Atom<AgenticError | null>;
  $wasCancelled: Atom<boolean>;
  $truncatedBefore: Atom<string | null>; // ID of first surviving entry after context truncation
  cancel(): void;
  destroy(): void;
  query(input: string): void;
  reset(): void;
}
```

**Key invariants:**

- `query()` synchronously sets `$loading` to `"reasoning"` and appends a `UserMessage` to `$entries`. The RxJS pipeline reacts to this change.
- `cancel()` aborts the in-flight request, sets `$loading` to `"cancelled"` for 1500 ms, then resets to `"none"`.
- `reset()` clears all entries and resets all atoms to their initial state. Iteration count resets to 0.
- `destroy()` is a permanent teardown — completes the Subject and unsubscribes all RxJS subscriptions. Call it when the component unmounts.

### `StreamProvider` — the network seam

```ts
type StreamProvider = (
  context: Context,
  tools: ToolDefinition[],
  signal?: AbortSignal,
) => FutureInstance<unknown, ReadableStream<{ data: string }>>;
```

This is the **only** network boundary in `createAgenticState`. The system prompt is **prepended by the caller's `StreamProvider` closure** — `createAgenticState` never appends it to the context itself. It only uses `SYSTEM_CARD_MESSAGE` to estimate token cost for context-window budget calculations.

In the extension (`Agentic.hoc.tsx`), the `StreamProvider` calls `apiClient.fetch('/agentic/response', ...)` and pipes the response through `event-stream-parser`'s `parse()` to convert the byte stream to `{ data: string }` objects.

In the eval harness (`packages/agentic/src/eval/streamProvider.ts`), it calls OpenRouter directly, bypassing the API server.

---

## Types

**Location**: `packages/agentic/src/types.ts`

```ts
// Conversation entries stored in state
type Entry = UserMessage | AssistantMessage | SystemMessage | ToolMessage;

// The model-facing context array (stripped of UI metadata like `id`, `timestamp`)
type Context = Array<
  | UserMessageContext
  | AssistantMessageContext
  | ToolMessageContext
  | SystemMessageContext
>;

// Tool result content — plain string for most tools, ContentBlock[] for captureScreenshot
type ContentBlock = TextContentBlock | ImageUrlContentBlock;

interface ToolMessage {
  content: string | Array<ContentBlock>; // string | [{type:'text',...}, {type:'image_url',...}]
  tool_call_id: string;
}
```

---

## System Cards (Prompts)

**Location**: `packages/agentic/src/model/system.ts`

Two system cards are exported:

| Export                          | Audience                              | Appended context                                                                             |
| ------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------- |
| `EXTENSION_SYSTEM_CARD_MESSAGE` | Non-engineer (capture extension user) | Focus on validating the bug, plain language, offer to file an issue                          |
| `WORKSPACE_SYSTEM_CARD_MESSAGE` | Engineer (workspace)                  | Reference API endpoints, stack traces, code locations; offer context bundle for coding agent |
| `SYSTEM_CARD_MESSAGE`           | Backwards-compat re-export            | Same as `WORKSPACE_SYSTEM_CARD_MESSAGE`                                                      |

Both extend a shared `SHARED_SYSTEM_CARD` string that defines the full investigation methodology (Orient → Step 2 → Conclude), tool rules, and response format.

**The system card is prepended by the StreamProvider, not by `createAgenticState`.** The state machine only reads `SYSTEM_CARD_MESSAGE` to estimate its token cost for context budget math.

---

## Tool System

### Registry

**Location**: `packages/agentic/src/model/tools/index.ts`

```ts
export const tools: ToolDefinition[]; // all 11 tools
export const extensionTools: ToolDefinition[]; // all except captureScreenshot
```

`extensionTools` excludes `captureScreenshot` because it has not been tested in the browser extension context.

### Tool Handler Contract

**Location**: `packages/agentic/src/model/tools/common.ts`

```ts
type ToolHandler = (
  recording: RecordingDataAccessor,
  args: Record<string, unknown>,
) => FutureInstance<unknown, unknown>;
```

**Critical rules:**

- Tool handlers **must** return `resolve(result)` — never a rejected Future.
- Errors must use `createError(error, reason?, suggestion?)` and be wrapped in `resolve(...)`:
  ```ts
  return resolve(
    createError(
      "No snapshot available at this time",
      "DOM snapshots are only present when the recording includes page load events",
      'Use getEvents(detail="summary") to check which event types are present',
    ),
  );
  ```
- Every successful result should include `_tokenEstimate: number` (informational; not read by the state machine).
- `captureScreenshot` is the only tool that returns `ContentBlock[]` (vision blocks). All other tools return plain JSON-serialisable objects. `buildToolMessageContent(toolName, output)` handles the branching — call it whenever constructing a `ToolMessage`.

### Available Tools

| Tool                   | What it returns                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `getRecordingDuration` | Total recording duration in ms                                                               |
| `getConsoleMessages`   | Console log/warn/error/debug messages with levels and timestamps                             |
| `getNetworkRequests`   | XHR/fetch requests and responses (URL, status, headers, body)                                |
| `getDOMState`          | Accessibility tree snapshot at a given timestamp                                             |
| `findErrors`           | Summary or full details of console errors and failed network requests                        |
| `getElementDetails`    | Full attributes, ancestors, and children for a specific `nodeId`                             |
| `getEvents`            | Broad timeline overview or detailed event list                                               |
| `getEventsAroundTime`  | Targeted event window around a specific timestamp                                            |
| `getDOMDiff`           | DOM mutations between two timestamps for a node subtree                                      |
| `getUserActions`       | Narrated list of user interactions (clicks, text input, scroll, navigation)                  |
| `captureScreenshot`    | Renders a VTree snapshot to a canvas and returns a `dataUrl` + `ContentBlock[]`              |
| `getStateChanges`      | State machine / framework state changes detected in the recording                            |
| `findUserFrustration`  | Detects rage clicks, dead clicks, rapid navigation, and error loops; returns signals by time |

### Tool Execution

```ts
executeToolCalls(recording, toolCalls): FutureInstance<unknown, Array<ToolMessage>>
```

Uses `parallel(Infinity)` from fluture to run all tool calls **concurrently**. Results are returned **in the original call order** — fluture's `parallel` preserves index ordering regardless of completion order.

---

## Iteration Limit

**Location**: `packages/agentic/src/createState.ts`

```ts
export const MAX_TOOL_ITERATIONS = 25;
```

Enforced in the `"completion"` chunk handler. When `iterationCount >= MAX_TOOL_ITERATIONS`:

1. A sentinel `AssistantMessage` is appended with text containing `"iteration limit"`.
2. `toolCallTrigger$.next()` is **not** called — the loop terminates.
3. `$loading` is set to `"none"`.

---

## Retry Logic

The stream error handler (`catchError` in `createResponseStream`) retries up to 2 times for HTTP 408, 429, and 503:

- Retry 1: 1 s delay, then `toolCallTrigger$.next()`
- Retry 2: 2 s delay, then `toolCallTrigger$.next()`
- After 2 retries (or for non-retryable errors): sets `$error` with `{ message, retryable, attempt }` and stops.

`AbortError` (user cancel) is silently swallowed — it does not set `$error`.

---

## Context-Window Management

**Location**: `packages/agentic/src/model/context-window.ts`

```ts
// Budget = floor(contextWindow × 0.9) - systemTokens - 4000
function computeContextBudget(
  modelId: string,
  systemPromptTokens: number,
): number;

// Walk backwards from newest message, keep as many recent messages as fit
function truncateToContextBudget<T>(
  messages: T[],
  budget: number,
  estimateMessage: (msg: T) => number,
): TruncationResult<T>;
```

When messages are dropped, `createAgenticState` sets `$truncatedBefore` to the ID of the **first surviving entry**. The UI uses this to insert a `truncation-indicator` render item at that position via `groupToolCalls(entries, truncatedBeforeId)`.

The token estimator (`packages/agentic/src/model/token-optimization.ts`) uses a rough character-count heuristic — not a real tokenizer.

---

## `RecordingDataAccessor`

**Location**: `packages/agentic/src/types.ts`

```ts
interface RecordingDataAccessor {
  getDuration(): number;
  getSnapshotAtTime(timestampMs: number): Snapshot | null;
  getResourceMap(): Record<string, string>; // absoluteURL → resolved URL
  getEventsByType(types: SourceEventType[], opts?): SourceEvent[];
  getEventsInRange(startMs: number, endMs: number, opts?): SourceEvent[];
}
```

The shared implementation factory (`makeAccessorFromEventList`) lives in `packages/agentic/src/recordingDataAccessor.ts` and implements `getEventsByType` and `getEventsInRange` over an `EventList` interface. Callers must provide `getDuration`, `getSnapshotAtTime`, and `getResourceMap` themselves.

In the extension (`Agentic.hoc.tsx`), the accessor is built by spreading `makeAccessorFromEventList(playback.getSourceEvents())` with the three remaining methods implemented inline from `playback.*`.

---

## Models

**Location**: `packages/domain/src/model-configs.ts`

| Constant                | Value                       | Purpose                                                                            |
| ----------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| `AGENTIC_DEFAULT_MODEL` | `'minimax/minimax-m2.7'`    | Production model (204,800 token context; perfect correctness on all eval fixtures) |
| `EVAL_JUDGE_MODEL`      | `'google/gemini-2.5-flash'` | LLM-as-judge for eval scoring                                                      |
| `EVAL_REASONING_MODEL`  | `'google/gemini-2.5-pro'`   | Eval critic and introspector                                                       |

**`reasoning.effort` guard**: The `reasoning.effort` parameter is only supported by OpenAI models (`openai/*`). The eval `streamProvider.ts` correctly guards this with `modelId.startsWith("openai/")`. The production `services/agentic.ts` currently sends it unconditionally — this is a known gap to fix when the model becomes configurable.

---

## Frontend

### React Context

**Location**: `packages/agentic-ui/src/context.tsx`

```ts
export const AgenticStateContext =
  React.createContext<AgenticState>(/* no-op default */);
export function useAgenticState(): AgenticState;
```

Callers wrap their tree with `<AgenticStateContext.Provider value={state}>` where `state` comes from `createAgenticState(...)`.

### `groupToolCalls`

**Location**: `packages/agentic/src/utils/groupToolCalls.ts`

```ts
groupToolCalls(entries: Array<Entry>, truncatedBeforeId?: string | null): Array<RenderItem>
```

Converts the flat `Entry[]` array into typed render items for the UI:

```ts
type RenderItem =
  | { type: "user-message"; entry: UserMessage }
  | { type: "assistant-message"; entry: AssistantMessage }
  | { type: "tool-call-group"; pairs: ToolCallPair[] } // ToolCall + matching ToolMessage | null
  | { type: "truncation-indicator" };
```

The `truncation-indicator` item is inserted **before** the first surviving entry identified by `truncatedBeforeId`. A `tool-call-group` is always emitted after the `assistant-message` if the assistant message has both text content and tool calls.

### Error detection in `ToolCallRow`

`ToolCallRow` detects tool errors by checking whether the parsed JSON tool content contains an `error` string property:

```ts
const parsed = safeParse(content); // content is ToolMessage.content
const isError =
  parsed !== null && typeof parsed === "object" && "error" in parsed;
```

---

## API Server

### `POST /agentic/response`

**Location**: `apps/api-server/src/routers/agentic.ts`

Rate-limited (30 req/min per user or IP). Validates `messages`, `tools`, and optional `tool_choice` via Zod, then calls `agenticService.getStreamingResponse(...)` and streams the raw SSE body back to the client with `content-type: text/event-stream`.

No server-side transformation of the stream — the raw OpenRouter SSE body is piped through unchanged.

### `POST /agentic/feedback`

Stores `{ userId, sentiment, promptVersion, comment, recordingId }` in the `agentic_feedback` table. `promptVersion` is a 16-char hex SHA-256 of the system prompt string (computed client-side in `Agentic.hoc.tsx`).

---

## Eval Harness

**Location**: `packages/agentic/src/eval/`

### Running evals

```sh
OPENROUTER_API_KEY=<key> moon run repro/agentic:eval
OPENROUTER_API_KEY=<key> moon run repro/agentic:eval -- --model google/gemini-2.5-flash
OPENROUTER_API_KEY=<key> moon run repro/agentic:eval -- --test-set
OPENROUTER_API_KEY=<key> moon run repro/agentic:eval -- --analyse   # runs critique + prompt suggestions
```

### Fixtures

- **9 training fixtures** (default set) — `baseline.json`
- **6 held-out test fixtures** (`--test-set`) — `baseline-test.json`

Each fixture exports `createFixture(): EvalFixture` with:

```ts
interface EvalFixture {
  name: string;
  prompt: string;
  expectedOutcomeDescription: string;
  accessor: RecordingDataAccessor;
  systemPrompt: string; // the system card to evaluate
  promptExportName: string; // e.g. 'EXTENSION_SYSTEM_CARD_MESSAGE' — for grouping critiques
}
```

### Eval execution (`runner.ts`)

- `runEval` runs **3 repetitions sequentially** per fixture to avoid rate-limit inflation.
- Fixture-level parallelism via `Promise.all` in `index.ts`.
- `scoreEvalRun` (LLM-as-judge using `EVAL_JUDGE_MODEL`) checks: `correct` (boolean) + 3 quality dimensions (`brevity`, `directness`, `signalNoise`, each 1–3).

### Regression thresholds (`regressions.ts`)

| Metric            | Threshold                                 |
| ----------------- | ----------------------------------------- |
| `correctnessRate` | Any drop is a regression (zero tolerance) |
| `avgErrorRate`    | > baseline + 10 pp                        |
| `avgToolCalls`    | > baseline + 3                            |
| `avgQuality`      | Composite drop > 0.5 points               |

New fixtures (no baseline entry) are never treated as regressions.

### Updating the baseline

1. Run evals and verify `tmp/agentic-eval-results.json`.
2. Run the one-liner in `eval/index.ts` file header comments to extract the `BaselineEntry[]` fields and write `baseline.json` (or `baseline-test.json` for `--test-set`).
3. Commit the updated baseline file.

### `--analyse` flag

Runs the full critique pipeline after evals:

1. `critiqueRun` (per run) → `CritiqueItem[]` linking observed behaviour to prompt causes.
2. `suggestPromptImprovements` (per prompt group) → `PromptSuggestion[]` (verbatim find-replace pairs ready to apply).

---

## Known Issues / Gaps

- **`reasoning.effort` guard missing in production**: `apps/api-server/src/services/agentic.ts` sends `reasoning: { effort: 'medium', exclude: true }` unconditionally. This is only valid for `openai/*` models. Must be guarded (e.g., `if (AGENTIC_DEFAULT_MODEL.startsWith('openai/'))`) before switching to a non-OpenAI model.
- **`captureScreenshot` excluded from extension**: The tool is in `tools[]` but not `extensionTools[]`. It has not been tested in the browser extension context. Re-include it once validated.
- **Resource map in extension accessor is always empty**: `playback.getResourceMap()` returns `{}` in the capture widget (resources are not fetched client-side). Tracked as REP-XXX.

---

## Key Files Quick Reference

| File                                                 | Key exports                                                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/agentic/src/createState.ts`                | `createAgenticState`, `executeToolCalls`, `buildToolMessageContent`, `MAX_TOOL_ITERATIONS`, `accumulateToolCalls`          |
| `packages/agentic/src/types.ts`                      | All shared types: `Entry`, `Context`, `AgenticState`, `StreamProvider`, `RecordingDataAccessor`, `ContentBlock`, `Loading` |
| `packages/agentic/src/index.ts`                      | Public barrel — everything exported from the package                                                                       |
| `packages/agentic/src/model/system.ts`               | `EXTENSION_SYSTEM_CARD_MESSAGE`, `WORKSPACE_SYSTEM_CARD_MESSAGE`, `SYSTEM_CARD_MESSAGE`                                    |
| `packages/agentic/src/model/context-window.ts`       | `computeContextBudget`, `truncateToContextBudget`                                                                          |
| `packages/agentic/src/model/tools/index.ts`          | `tools`, `extensionTools`, `executeTool`                                                                                   |
| `packages/agentic/src/model/tools/common.ts`         | `ToolHandler` type, `createError()`, event type guards                                                                     |
| `packages/agentic/src/recordingDataAccessor.ts`      | `makeAccessorFromEventList`, `EventList`                                                                                   |
| `packages/agentic/src/utils/groupToolCalls.ts`       | `groupToolCalls`, `RenderItem` types                                                                                       |
| `packages/agentic/src/eval/index.ts`                 | CLI entry point, fixture lists, `buildPromptGroups`                                                                        |
| `packages/agentic/src/eval/runner.ts`                | `runEval`, `runSingle`, `EvalFixture`, `EvalResult`                                                                        |
| `packages/agentic/src/eval/regressions.ts`           | `findRegressions`, regression thresholds                                                                                   |
| `packages/agentic/src/eval/streamProvider.ts`        | `createOpenRouterStreamProvider` (direct OpenRouter, bypasses API server)                                                  |
| `packages/agentic-ui/src/context.tsx`                | `AgenticStateContext`, `useAgenticState`                                                                                   |
| `packages/agentic-ui/src/components/MessageList.tsx` | Imports and uses `groupToolCalls` directly from `@repro/agentic`                                                           |
| `packages/domain/src/model-configs.ts`               | `AGENTIC_DEFAULT_MODEL`, `EVAL_JUDGE_MODEL`, `EVAL_REASONING_MODEL`, `MODEL_CONFIGS`, `getModelConfig`                     |
| `apps/api-server/src/routers/agentic.ts`             | `POST /agentic/response`, `POST /agentic/feedback`                                                                         |
| `apps/api-server/src/services/agentic.ts`            | `createAgenticService`, `getStreamingResponse`, `recordFeedback`                                                           |
| `apps/capture/.../Agentic.hoc.tsx`                   | Extension wiring: `StreamProvider`, `RecordingDataAccessor`, `extensionTools`                                              |
