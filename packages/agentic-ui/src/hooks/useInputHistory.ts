import { useEffect, useRef, useState } from "react";
import { Entry } from "@repro/agentic";

/**
 * Extract the text content of every user message from an entries array,
 * in chronological order.
 */
export function extractUserMessages(entries: Array<Entry>): Array<string> {
  const messages: Array<string> = [];
  for (const entry of entries) {
    if (entry.role === "user") {
      messages.push(entry.content);
    }
  }
  return messages;
}

/**
 * A mutable cursor over a history array that supports shell-style navigation.
 * Position -1 = "neutral" (not in history). Position 0 = oldest, length-1 = newest.
 *
 * navigateUp  → move toward older messages; returns the message text or null if
 *               history is empty.
 * navigateDown → move toward newer messages; returns null when stepping past the
 *                most recent (i.e. "exit" history mode).
 * reset        → return cursor to neutral without affecting history.
 */
export function createHistoryCursor(history: Array<string>) {
  // -1 means "not browsing history" (neutral)
  let position = -1;

  return {
    navigateUp(): string | null {
      if (history.length === 0) return null;
      // Move toward older: clamp at index 0
      if (position === -1) {
        position = history.length - 1;
      } else if (position > 0) {
        position -= 1;
      }
      return history[position] ?? null;
    },

    navigateDown(): string | null {
      if (position === -1) return null;
      if (position < history.length - 1) {
        position += 1;
        return history[position] ?? null;
      }
      // Past the most recent → exit history mode
      position = -1;
      return null;
    },

    reset() {
      position = -1;
    },
  };
}

export interface UseInputHistoryReturn {
  /** The value to populate the input with, or null when not in history mode. */
  historyValue: string | null;
  /**
   * Navigate through history in the given direction.
   * - 'up' moves toward older messages and returns the message text (or null if
   *   history is empty or already at the oldest).
   * - 'down' moves toward newer messages and returns null when stepping past
   *   the most recent (signalling "exit history mode").
   *
   * The input value is updated automatically via `historyValue`.
   */
  navigate(direction: "up" | "down"): void;
  /** Reset history navigation state (call on agentic.reset()). */
  resetHistory(): void;
}

/**
 * Shell-style history navigation for a chat input.
 *
 * Derived from the entries list — user messages are the history.
 * History cursor resets whenever entries is replaced by an empty array
 * (which happens on agentic.reset()).
 */
export function useInputHistory(entries: Array<Entry>): UseInputHistoryReturn {
  const userMessages = extractUserMessages(entries);

  // Use a ref for the cursor so mutations do not cause re-renders.
  const cursorRef = useRef(createHistoryCursor(userMessages));
  // historyValue drives a controlled value in the input; null = not in history mode.
  const [historyValue, setHistoryValue] = useState<string | null>(null);

  // When entries empties (agentic.reset()), rebuild cursor and exit history mode.
  useEffect(() => {
    if (entries.length === 0) {
      cursorRef.current = createHistoryCursor([]);
      setHistoryValue(null);
    }
  }, [entries]);

  // Keep cursor in sync with the latest user messages without resetting position
  // mid-navigation. We rebuild on every render but only mutate state when entries
  // is reset to empty (above).
  cursorRef.current = createHistoryCursor(userMessages);

  function navigate(direction: "up" | "down"): void {
    if (direction === "up") {
      const value = cursorRef.current.navigateUp();
      if (value !== null) {
        setHistoryValue(value);
      }
    } else {
      const value = cursorRef.current.navigateDown();
      // null means "exit history mode" — restore to empty input
      setHistoryValue(value);
    }
  }

  function resetHistory() {
    cursorRef.current.reset();
    setHistoryValue(null);
  }

  return { historyValue, navigate, resetHistory };
}
