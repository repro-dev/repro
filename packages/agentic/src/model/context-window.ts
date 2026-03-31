import { getModelConfig } from "@repro/domain";

const CURRENT_TURN_RESERVE = 4_000;
const SAFETY_FACTOR = 0.9;

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

    return { messages: messages.slice(startIndex), droppedCount: startIndex };
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

  return { messages: survivingMessages, droppedCount };
}
