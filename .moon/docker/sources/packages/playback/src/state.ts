import { createAtom } from '@repro/atom'
import { SyntheticId } from '@repro/domain'

export enum ReadyState {
  Loading,
  Ready,
}

// TODO: move these on to context
export const [$focusedNode, setFocusedNode, getFocusedNode] =
  createAtom<SyntheticId | null>(null)
export const [$readyState, setReadyState, getReadyState] = createAtom(
  ReadyState.Loading
)
