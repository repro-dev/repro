import { useAtomState, useAtomValue } from '@repro/atom'
import {
  detectOverrides,
  INHERITED_PROPERTIES,
  matchCSSRules,
  sortCascade,
} from '@repro/css-utils'
import { isElementNode } from '@repro/dom-utils'
import type { CapturedCSSRule, CapturedStyleSheet } from '@repro/domain'
import { useSnapshot } from '@repro/playback'
import { useContext, useMemo } from 'react'
import { DevToolsStateContext } from './context'

// ---------------------------------------------------------------------------
// Matched CSS rules types and helpers
// ---------------------------------------------------------------------------

import type { RuleWithOverrides } from '@repro/css-utils'

export interface MatchedRuleEntry extends RuleWithOverrides {
  source: string
}

export interface InheritedGroup {
  ancestorLabel: string
  rules: CapturedCSSRule[]
}

export interface MatchedCSSRulesResult {
  inline: MatchedRuleEntry | null
  rules: MatchedRuleEntry[]
  inherited: InheritedGroup[]
}

function describeElement(element: Element): string {
  let label = element.tagName.toLowerCase()
  if (element.id) {
    label += `#${element.id}`
  }
  const classes = Array.from(element.classList)
  for (const cls of classes) {
    label += `.${cls}`
  }
  return label
}

function buildInlineRule(element: Element): MatchedRuleEntry | null {
  const style = (element as HTMLElement).style
  if (!style || style.length === 0) {
    return null
  }

  const declarations: Record<string, string> = {}
  const priorities: Record<string, string> = {}

  for (let i = 0; i < style.length; i++) {
    const prop = style.item(i)
    if (prop) {
      declarations[prop] = style.getPropertyValue(prop)
      const priority = style.getPropertyPriority(prop)
      if (priority) {
        priorities[prop] = priority
      }
    }
  }

  if (Object.keys(declarations).length === 0) {
    return null
  }

  return {
    selectorText: '',
    declarations,
    priorities,
    specificity: { a: 0, b: 0, c: 0 },
    stylesheetId: 'inline',
    ruleIndex: 0,
    mediaCondition: null,
    supportsCondition: null,
    isInline: true,
    importInaccessible: false,
    overriddenDeclarations: new Set<string>(),
    winningDeclarations: new Set<string>(Object.keys(declarations)),
    source: 'element.style',
  }
}

function resolveSource(
  stylesheetId: string,
  sheetMap: Map<string, CapturedStyleSheet>
): string {
  if (stylesheetId === 'inline') {
    return 'element.style'
  }
  const sheet = sheetMap.get(stylesheetId)
  if (!sheet) {
    return '<style>'
  }
  if (sheet.href) {
    const basename = sheet.href.split('/').pop() ?? sheet.href
    return basename
  }
  return '<style>'
}

/**
 * Pure function that matches CSS rules for a given element.
 * Exported for direct testing without React context.
 */
export function matchCSSRulesForElement(
  element: Element,
  stylesheets: CapturedStyleSheet[]
): MatchedCSSRulesResult {
  // Build stylesheet map for source resolution
  const sheetMap = new Map<string, CapturedStyleSheet>()
  for (const sheet of stylesheets) {
    sheetMap.set(sheet.id, sheet)
  }

  // Step 1: Collect all non-inline rules
  const allRules = stylesheets
    .flatMap(s => s.rules)
    .filter(r => !r.isInline && r.stylesheetId !== 'inline')

  // Step 2: Direct match against the element
  const directMatched = matchCSSRules(allRules, element)

  // Step 3: Build inline rule from live element.style
  const inlineRule = buildInlineRule(element)

  // Step 4: Sort cascade ascending (lowest priority first)
  const cascadeAsc: CapturedCSSRule[] = sortCascade(directMatched, stylesheets)
  if (inlineRule) {
    // Append inline at the end (highest priority slot) — do NOT pass through sortCascade
    cascadeAsc.push(inlineRule)
  }

  // Step 5: Detect overrides
  const withOverrides = detectOverrides(cascadeAsc)

  // Step 6: Reverse to highest-priority-first for display
  const displayDesc = [...withOverrides].reverse()

  // Step 7: Split inline vs rules
  const inline = displayDesc.find(r => r.stylesheetId === 'inline') ?? null
  const rules = displayDesc
    .filter(r => r.stylesheetId !== 'inline')
    .map(r => ({
      ...r,
      source: resolveSource(r.stylesheetId, sheetMap),
    }))

  // Step 8: Inherited — walk parentElement chain
  const inherited: InheritedGroup[] = []
  let ancestor: Element | null = element.parentElement

  while (ancestor) {
    const ancestorMatched = matchCSSRules(allRules, ancestor)
    if (ancestorMatched.length > 0) {
      const ancestorCascade = sortCascade(ancestorMatched, stylesheets)
      const ancestorDesc = [...ancestorCascade].reverse()

      const filteredRules: CapturedCSSRule[] = []
      for (const rule of ancestorDesc) {
        const filteredDeclarations: Record<string, string> = {}
        const filteredPriorities: Record<string, string> = {}

        for (const [prop, value] of Object.entries(rule.declarations)) {
          if (INHERITED_PROPERTIES.has(prop)) {
            filteredDeclarations[prop] = value
            if (rule.priorities[prop]) {
              filteredPriorities[prop] = rule.priorities[prop]!
            }
          }
        }

        if (Object.keys(filteredDeclarations).length > 0) {
          filteredRules.push({
            ...rule,
            declarations: filteredDeclarations,
            priorities: filteredPriorities,
          })
        }
      }

      if (filteredRules.length > 0) {
        inherited.push({
          ancestorLabel: describeElement(ancestor),
          rules: filteredRules,
        })
      }
    }

    ancestor = ancestor.parentElement
  }

  return {
    inline: inline ? { ...inline, source: 'element.style' } : null,
    rules,
    inherited,
  }
}

/**
 * Hook that memoizes matchCSSRulesForElement over the current snapshot's cssRules.
 * Returns null when element is null.
 */
export function useMatchedCSSRules(
  element: Element | null
): MatchedCSSRulesResult | null {
  const snapshot = useSnapshot()

  return useMemo(() => {
    if (!element) {
      return null
    }
    return matchCSSRulesForElement(element, snapshot.cssRules ?? [])
  }, [element, snapshot.cssRules])
}

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
