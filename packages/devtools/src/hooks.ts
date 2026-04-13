import { useAtomState, useAtomValue } from '@repro/atom'
import {
  computeOverrideState,
  extractStylesheetRules,
  getAncestorRules,
  matchRulesToElement,
  type CapturedCSSRule,
  type InheritedRule,
  type MatchedRule,
} from '@repro/css-utils'
import { isElementNode } from '@repro/dom-utils'
import { useContext, useEffect, useState } from 'react'
import { DevToolsStateContext } from './context'

export function useDevToolsState() {
  return useContext(DevToolsStateContext)
}

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

export function useMatchedCSSRules() {
  const selectedElement = useSelectedElement()
  const [matchedRules, setMatchedRules] = useState<Array<MatchedRule>>([])
  const [inheritedRules, setInheritedRules] = useState<Array<InheritedRule>>([])
  const [allRules, setAllRules] = useState<Array<CapturedCSSRule>>([])

  useEffect(() => {
    if (!selectedElement) {
      setAllRules([])
      return
    }

    const doc = selectedElement.ownerDocument
    if (!doc) {
      setAllRules([])
      return
    }

    try {
      const rules = extractStylesheetRules(doc)
      setAllRules(rules)
    } catch {
      setAllRules([])
    }
  }, [selectedElement])

  useEffect(() => {
    if (!selectedElement || allRules.length === 0) {
      setMatchedRules([])
      setInheritedRules([])
      return
    }

    try {
      const doc = selectedElement.ownerDocument
      const win = doc?.defaultView
      const computedStyle = win?.getComputedStyle(selectedElement) ?? null

      const matched = matchRulesToElement(selectedElement, allRules)
      const withOverrideState = computeOverrideState(matched, computedStyle)
      const inherited = getAncestorRules(selectedElement, allRules)

      setMatchedRules(withOverrideState)
      setInheritedRules(inherited)
    } catch {
      setMatchedRules([])
      setInheritedRules([])
    }
  }, [selectedElement, allRules])

  return { matchedRules, inheritedRules }
}
