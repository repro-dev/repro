import { Entry } from '@repro/agentic'
import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Extract the text content of every user message from an entries array,
 * in chronological order.
 */
export function extractUserMessages(entries: Array<Entry>): Array<string> {
  const messages: Array<string> = []
  for (const entry of entries) {
    if (entry.role === 'user') {
      messages.push(entry.content)
    }
  }
  return messages
}

/**
 * A mutable cursor over a history array that supports shell-style navigation.
 * Position -1 = "neutral" (not in history). Position 0 = oldest, length-1 = newest.
 *
 * navigateUp  → move toward older messages; returns the message text or null if
 *               history is empty.
 * navigateDown → move toward newer messages; returns the saved draft value (or null
 *                if no draft) when stepping past the most recent (i.e. "exit" history mode).
 * saveDraft    → capture a draft value to restore when exiting history mode.
 * reset        → return cursor to neutral without affecting history.
 */
export function createHistoryCursor(
  history: Array<string>,
  initialDraft?: string
) {
  // -1 means "not browsing history" (neutral)
  let position = -1
  // Draft is the value the user had typed before entering history mode.
  // Restored when navigating back past the most recent entry.
  let draft: string | null = initialDraft ?? null

  return {
    navigateUp(): string | null {
      if (history.length === 0) return null
      // Move toward older: clamp at index 0
      if (position === -1) {
        position = history.length - 1
      } else if (position > 0) {
        position -= 1
      }
      return history[position] ?? null
    },

    navigateDown(): string | null {
      if (position === -1) return null
      if (position < history.length - 1) {
        position += 1
        return history[position] ?? null
      }
      // Past the most recent → exit history mode, restore draft
      position = -1
      const restored = draft
      draft = null
      return restored
    },

    saveDraft(value: string): void {
      draft = value
    },

    reset() {
      position = -1
      draft = null
    },
  }
}

export interface UseInputHistoryReturn {
  /** The value to populate the input with, or null when not in history mode. */
  historyValue: string | null
  /**
   * Navigate through history in the given direction.
   * - 'up' moves toward older messages and enters history mode. Pass `currentValue`
   *   to save the pre-navigation draft so it can be restored on exit.
   * - 'down' moves toward newer messages and returns the draft when stepping past
   *   the most recent (signalling "exit history mode").
   *
   * The input value is updated automatically via `historyValue`.
   */
  navigate(direction: 'up' | 'down', currentValue?: string): void
  /** Reset history navigation state (call on agentic.reset()). */
  resetHistory(): void
}

/**
 * Shell-style history navigation for a chat input.
 *
 * Derived from the entries list — user messages are the history.
 * History cursor resets whenever entries is replaced by an empty array
 * (which happens on agentic.reset()).
 */
export function useInputHistory(entries: Array<Entry>): UseInputHistoryReturn {
  // Memoize the extracted messages so the array reference is stable across
  // renders that don't change entries — this prevents the cursor from being
  // rebuilt on unrelated re-renders.
  const userMessages = useMemo(() => extractUserMessages(entries), [entries])

  // Use a ref for the cursor so mutations do not cause re-renders.
  // Initialise once; the effect below syncs it when userMessages changes.
  const cursorRef = useRef(createHistoryCursor(userMessages))
  // historyValue drives a controlled value in the input; null = not in history mode.
  const [historyValue, setHistoryValue] = useState<string | null>(null)

  // Rebuild the cursor only when the message list actually changes. Using a ref
  // for the cursor (rather than re-creating inline on every render) is what keeps
  // the navigation position stable across unrelated parent re-renders.
  useEffect(() => {
    cursorRef.current = createHistoryCursor(userMessages)
    // When entries is reset to empty (agentic.reset()), also exit history mode.
    if (userMessages.length === 0) {
      setHistoryValue(null)
    }
  }, [userMessages])

  function navigate(direction: 'up' | 'down', currentValue?: string): void {
    if (direction === 'up') {
      // Save the draft only when first entering history mode (historyValue is null
      // means we're currently at neutral). Subsequent up presses while already in
      // history should not overwrite the original draft with a history entry value.
      if (historyValue === null && currentValue !== undefined) {
        cursorRef.current.saveDraft(currentValue)
      }
      const value = cursorRef.current.navigateUp()
      if (value !== null) {
        setHistoryValue(value)
      }
    } else {
      const value = cursorRef.current.navigateDown()
      // null means "exit history mode" — restore draft (may be empty string) or null
      setHistoryValue(value)
    }
  }

  function resetHistory() {
    cursorRef.current.reset()
    setHistoryValue(null)
  }

  return { historyValue, navigate, resetHistory }
}
