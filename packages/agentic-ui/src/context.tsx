import { atom } from "@repro/atom";
import { AgenticState, Entry, Loading } from "@repro/agentic";
import React, { useContext } from "react";

export const AgenticStateContext = React.createContext<AgenticState>({
  $entries: atom<Array<Entry>>([]),
  $loading: atom<Loading>("none"),
  destroy: () => {},
  query: () => {},
});

export function useAgenticState() {
  return useContext(AgenticStateContext);
}
