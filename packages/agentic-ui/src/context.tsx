import { atom } from '@repro/atom'
import { AgenticError, AgenticState, Entry, Loading } from '@repro/agentic'
import React, { useContext } from 'react'

export const AgenticStateContext = React.createContext<AgenticState>({
  $entries: atom<Array<Entry>>([]),
  $loading: atom<Loading>('none'),
  $error: atom<AgenticError | null>(null),
  cancel: () => {},
  destroy: () => {},
  query: () => {},
})

export function useAgenticState() {
  return useContext(AgenticStateContext)
}
