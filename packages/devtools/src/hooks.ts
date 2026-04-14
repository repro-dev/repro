import { useAtomState, useAtomValue } from '@repro/atom'
import {
  CapturedCSSRule,
  computeOverrideState,
  extractStylesheetRules,
  getAncestorRules,
  InheritedRule,
  MatchedRule,
  matchRulesToElement,
} from '@repro/css-utils'
import { isElementNode } from '@repro/dom-utils'
import { useLatestControlFrame } from '@repro/playback'
import { useContext, useEffect, useState } from 'react'
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

/**
 * Returns matched CSS rules and inherited rules for the currently selected element.
 * Reads from the live playback iframe DOM at call time.
 */
export function useMatchedCSSRules(): {
  matchedRules: MatchedRule[]
  inheritedRules: InheritedRule[]
} {
  const selectedElement = useSelectedElement()
  const latestControlFrame = useLatestControlFrame()
  const [allRules, setAllRules] = useState<CapturedCSSRule[]>([])
  const [matchedRules, setMatchedRules] = useState<MatchedRule[]>([])
  const [inheritedRules, setInheritedRules] = useState<InheritedRule[]>([])

  // Extract all stylesheet rules from the element's owner document.
  // Re-run on latestControlFrame to pick up CSS-in-JS injections at different playback positions.
  useEffect(() => {
    if (!selectedElement) {
      setAllRules([])
      return
    }

    try {
      const doc = selectedElement.ownerDocument
      if (doc) {
        setAllRules(extractStylesheetRules(doc))
      }
    } catch {
      setAllRules([])
    }
  }, [selectedElement, latestControlFrame])

  // Match extracted rules to the selected element.
  // Re-run on latestControlFrame so computed style reflects current playback position.
  useEffect(() => {
    if (!selectedElement || !allRules.length) {
      setMatchedRules([])
      setInheritedRules([])
      return
    }

    try {
      const doc = selectedElement.ownerDocument
      const win = doc ? doc.defaultView : null
      const computedStyle = win ? win.getComputedStyle(selectedElement) : null

      const raw = matchRulesToElement(selectedElement, allRules)
      const withOverrides = computeOverrideState(raw, computedStyle)
      const inherited = getAncestorRules(selectedElement, allRules)

      setMatchedRules(withOverrides)
      setInheritedRules(inherited)
    } catch {
      setMatchedRules([])
      setInheritedRules([])
    }
  }, [selectedElement, allRules, latestControlFrame])

  return { matchedRules, inheritedRules }
}
