import { useAtomState, useAtomValue } from '@repro/atom'
import { isElementNode } from '@repro/dom-utils'
import { useContext } from 'react'
import { DevToolsStateContext } from './context'

export function useDevToolsState() {
  return useContext(DevToolsStateContext)
}

// @deprecated
export function useActive() {
  const state = useDevToolsState()
  return useAtomValue(state.$inspecting)
}

export function useInspecting() {
  const state = useDevToolsState()
  return useAtomState(state.$inspecting)
}

export function useElementPicker() {
  const state = useDevToolsState()
  return useAtomState(state.$picker)
}

export function useCurrentDocument() {
  const state = useDevToolsState()
  return useAtomState(state.$currentDocument)
}

export function useNodeMap() {
  const state = useDevToolsState()
  return useAtomState(state.$nodeMap)
}

export function useFocusedNode() {
  const state = useDevToolsState()
  return useAtomState(state.$focusedNode)
}

export function useSelectedNode() {
  const state = useDevToolsState()
  return useAtomState(state.$selectedNode)
}

export function useMask() {
  const state = useDevToolsState()
  return useAtomState(state.$mask)
}

export function useSize() {
  const state = useDevToolsState()
  return useAtomState(state.$size)
}

export function useDevToolsView() {
  const state = useDevToolsState()
  return useAtomState(state.$view)
}

export function useSelectedElement() {
  const [nodeMap] = useNodeMap()
  const [selectedNode] = useSelectedNode()
  const node = selectedNode ? nodeMap[selectedNode] || null : null
  return node && isElementNode(node) ? node : null
}

export function useConsoleSearch() {
  const state = useDevToolsState()
  return useAtomState(state.$consoleSearch)
}

export function useConsoleLevelFilter() {
  const state = useDevToolsState()
  return useAtomState(state.$consoleLevelFilter)
}
