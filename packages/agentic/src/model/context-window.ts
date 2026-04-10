import { getModelConfig } from "@repro/domain";
import type { Context } from "../types";

const CURRENT_TURN_RESERVE = 4_000;
const SAFETY_FACTOR = 0.9;

// Number of iterations to wait after a tool call errors before stripping its
// assistant tool-call block from context. The error result itself is always kept.
// 4 turns gives the model time to see the error at least once before the input
// is removed.
export const PURGE_ERROR_TURNS = 4;

export function computeContextBudget(
  modelId: string,
  systemPromptTokens: number,
): number {
  const config = getModelConfig(modelId);
  return (
    Math.floor(config.contextWindow * SAFETY_FACTOR) -
    systemPromptTokens -
    CURRENT_TURN_RESERVE
  );
}

export interface TruncationResult<T> {
  messages: T[];
  droppedCount: number;
  // True when at least one message was dropped (even if droppedCount is 0 due
  // to a protected message being the first retained, causing a gap at the start).
  anyDropped: boolean;
}

export function truncateToContextBudget<T>(
  messages: T[],
  budget: number,
  estimateMessage: (msg: T) => number,
  isProtected?: (msg: T) => boolean,
): TruncationResult<T> {
  // Original tail-truncation (no protection predicate or fallback path)
  function tailTruncate(): TruncationResult<T> {
    let tokenCount = 0;
    let startIndex = messages.length;

    for (let i = messages.length - 1; i >= 0; i--) {
      const tokens = estimateMessage(messages[i] as T);
      if (tokenCount + tokens > budget) {
        startIndex = i + 1;
        break;
      }
      tokenCount += tokens;
      startIndex = i;
    }

    return {
      messages: messages.slice(startIndex),
      droppedCount: startIndex,
      anyDropped: startIndex > 0,
    };
  }

  if (!isProtected) {
    return tailTruncate();
  }

  // Partition messages into protected and non-protected, preserving original indices.
  const protectedEntries: Array<{ idx: number; tokens: number }> = [];
  const nonProtectedEntries: Array<{ idx: number; tokens: number }> = [];

  for (let i = 0; i < messages.length; i++) {
    const tokens = estimateMessage(messages[i] as T);
    if (isProtected(messages[i] as T)) {
      protectedEntries.push({ idx: i, tokens });
    } else {
      nonProtectedEntries.push({ idx: i, tokens });
    }
  }

  const protectedTokens = protectedEntries.reduce(
    (sum, e) => sum + e.tokens,
    0,
  );

  // Fallback: if protected messages alone exceed the budget, ignore protection
  // and apply uniform tail-truncation.
  if (protectedTokens > budget) {
    return tailTruncate();
  }

  // Greedily fill remaining budget from the newest non-protected messages backward.
  const remainingBudget = budget - protectedTokens;
  let nonProtectedTokensUsed = 0;
  // Track which non-protected entries survive (by their index into nonProtectedEntries)
  const survivingNonProtectedIndices = new Set<number>();

  for (let i = nonProtectedEntries.length - 1; i >= 0; i--) {
    const entry = nonProtectedEntries[i]!;
    if (nonProtectedTokensUsed + entry.tokens > remainingBudget) {
      break;
    }
    nonProtectedTokensUsed += entry.tokens;
    survivingNonProtectedIndices.add(i);
  }

  // Build the retained set as a Set of original indices for O(1) lookup.
  const retainedOriginalIndices = new Set<number>(
    protectedEntries.map((e) => e.idx),
  );
  for (let i = 0; i < nonProtectedEntries.length; i++) {
    if (survivingNonProtectedIndices.has(i)) {
      retainedOriginalIndices.add(nonProtectedEntries[i]!.idx);
    }
  }

  // Merge survivors back in original order.
  const survivingMessages: T[] = [];
  let firstRetainedIdx = messages.length; // sentinel: nothing retained yet

  for (let i = 0; i < messages.length; i++) {
    if (retainedOriginalIndices.has(i)) {
      survivingMessages.push(messages[i] as T);
      if (firstRetainedIdx === messages.length) {
        firstRetainedIdx = i;
      }
    }
  }

  // droppedCount = index of the first retained message in the original array.
  // This matches the semantics used in createState.ts: orderedIds[droppedCount]
  // gives the ID of the first message the model will actually see.
  const droppedCount =
    firstRetainedIdx === messages.length ? messages.length : firstRetainedIdx;

  return {
    messages: survivingMessages,
    droppedCount,
    anyDropped: retainedOriginalIndices.size < messages.length,
  };
}

// Strips assistant tool-call blocks for errored tool calls that are more than
// PURGE_ERROR_TURNS iterations old. The ToolMessage result is always preserved —
// only the assistant's tool_use input block is removed. This reduces context
// noise from repeated failures while keeping the error output visible.
//
// erroredCalls: tool_call_id → iteration count when the error was recorded
// currentIteration: the current iteration count
export function purgeErroredToolCallInputs(
  context: Context,
  erroredCalls: ReadonlyMap<string, number>,
  currentIteration: number,
): Context {
  if (erroredCalls.size === 0) return context;

  // Build the set of tool_call_ids whose inputs should be purged.
  const purgeIds = new Set<string>();
  for (const [id, errorIteration] of erroredCalls) {
    if (currentIteration - errorIteration >= PURGE_ERROR_TURNS) {
      purgeIds.add(id);
    }
  }

  if (purgeIds.size === 0) return context;

  // Keep assistant tool_call entries as minimal stubs so any preserved
  // role:"tool" messages still have a valid preceding assistant message that
  // introduced the matching tool_call_id. Only the arguments payload is
  // stripped to reduce context noise.
  return context.flatMap((msg): Array<Context[number]> => {
    if (msg.role === "assistant" && "tool_calls" in msg && msg.tool_calls) {
      let changed = false;
      const rewrittenCalls = msg.tool_calls.map((tc) => {
        if (!purgeIds.has(tc.id)) {
          return tc;
        }

        changed = true;

        return {
          ...tc,
          function: {
            ...tc.function,
            // Preserve linkage and function identity while stripping the large
            // tool input payload.
            arguments: "{}",
          },
        };
      });

      if (!changed) {
        // Nothing changed — pass through unchanged.
        return [msg];
      }

      return [{ ...msg, tool_calls: rewrittenCalls }];
    }

    return [msg];
  });
}
