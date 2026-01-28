import { atom } from '@repro/atom'
import React, { useContext } from 'react'
import { AgenticState, Entry, Loading } from './types'

export const AgenticStateContext = React.createContext<AgenticState>({
  $entries: atom<Array<Entry>>([]),
  $loading: atom<Loading>('none'),
  destroy: () => {},
  query: () => {},
})

export function useAgenticState() {
  return useContext(AgenticStateContext)
}
