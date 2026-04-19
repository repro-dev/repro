import { atom } from "@repro/atom";
import {
  AgenticError,
  AgenticState,
  Entry,
  Loading,
  PendingAskUserInteraction,
} from "@repro/agentic";
import React, { useContext } from "react";

export const AgenticStateContext = React.createContext<AgenticState>({
  $entries: atom<Array<Entry>>([]),
  $loading: atom<Loading>("none"),
  $error: atom<AgenticError | null>(null),
  $wasCancelled: atom<boolean>(false),
  $pendingInteraction: atom<PendingAskUserInteraction | null>(null),
  $truncatedBefore: atom<string | null>(null),
  cancel: () => {},
  destroy: () => {},
  query: () => {},
  submitAskUserAnswer: () => {},
  reset: () => {},
});

export function useAgenticState() {
  return useContext(AgenticStateContext);
}
