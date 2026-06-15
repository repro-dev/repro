import {
  CapturedCSSRule,
  DOMPatchEvent,
  InteractionEvent,
  InteractionType,
  PatchType,
  PointerState,
  Snapshot,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'

import { applyVTreePatch } from '@repro/vdom-utils'
import { interpolatePointFromSample } from '../queries/interpolatePointFromSample'

export function applyStyleSheetMutationToSnapshot(
  snapshot: Snapshot,
  patch: {
    stylesheetId: string
    insertedRules: Array<CapturedCSSRule> | null
    deletedRuleIndex: number | null
    replaceText?: string | null
  },
  revert: boolean
) {
  if (!snapshot.cssRules) {
    snapshot.cssRules = []
  }

  const sheets = snapshot.cssRules
  let sheet = sheets.find(s => s.id === patch.stylesheetId)

  if (!sheet) {
    sheet = {
      id: patch.stylesheetId,
      href: null,
      rules: [],
      inaccessible: false,
    }
    sheets.push(sheet)
  }

  if (!revert) {
    // Forward: replace entire sheet text
    if (patch.replaceText != null) {
      sheet.rules = []
      if (patch.insertedRules) {
        for (const rule of patch.insertedRules) {
          sheet.rules.push(rule)
        }
      }
    }
    // Forward: insert rules
    if (patch.insertedRules) {
      for (const rule of patch.insertedRules) {
        sheet.rules.push(rule)
      }
    }
    // Forward: delete rules by ruleIndex
    if (patch.deletedRuleIndex !== null) {
      sheet.rules = sheet.rules.filter(
        r => r.ruleIndex !== patch.deletedRuleIndex
      )
    }
  } else {
    // Revert: remove previously inserted rules
    if (patch.insertedRules) {
      const toRemove = new Map<string, Set<number>>()
      for (const rule of patch.insertedRules) {
        const key = rule.selectorText
        let indices = toRemove.get(key)
        if (!indices) {
          indices = new Set()
          toRemove.set(key, indices)
        }
        indices.add(rule.ruleIndex)
      }
      sheet.rules = sheet.rules.filter(r => {
        const indices = toRemove.get(r.selectorText)
        return !indices || !indices.has(r.ruleIndex)
      })
    }
    // Revert delete: can't re-insert since rule data not in patch
  }
}

function applyDOMEventToSnapshot(
  snapshot: Snapshot,
  event: DOMPatchEvent,
  revert: boolean = false
) {
  if (snapshot.dom) {
    applyVTreePatch(snapshot.dom, event.data, revert)
  }

  // Handle CSS rule mutations in the snapshot
  event.data.apply(patch => {
    if (patch.type === PatchType.StyleSheetMutation) {
      applyStyleSheetMutationToSnapshot(snapshot, patch, revert)
    }
  })
}

function applyInteractionEventToSnapshot(
  snapshot: Snapshot,
  event: InteractionEvent,
  elapsed: number
) {
  event.data.apply(data => {
    if (snapshot.interaction) {
      switch (data.type) {
        case InteractionType.PointerMove:
          snapshot.interaction.pointer = interpolatePointFromSample(
            data,
            event.time,
            elapsed
          )
          break

        case InteractionType.PointerDown:
          snapshot.interaction.pointer = data.at
          snapshot.interaction.pointerState = PointerState.Down
          break

        case InteractionType.PointerUp:
          snapshot.interaction.pointer = data.at
          snapshot.interaction.pointerState = PointerState.Up
          break

        case InteractionType.ViewportResize:
          snapshot.interaction.viewport = interpolatePointFromSample(
            data,
            event.time,
            elapsed
          )
          break

        case InteractionType.Scroll:
          snapshot.interaction.scroll[data.target] = interpolatePointFromSample(
            data,
            event.time,
            elapsed
          )
          break

        case InteractionType.PageTransition:
          snapshot.interaction.pageURL = data.to
          break
      }
    }
  })
}

export function applyEventToSnapshot(
  snapshot: Snapshot,
  event: SourceEvent,
  elapsed: number,
  revert: boolean = false
) {
  event.apply(event => {
    switch (event.type) {
      case SourceEventType.DOMPatch:
        applyDOMEventToSnapshot(snapshot, event, revert)
        break

      case SourceEventType.Interaction:
        applyInteractionEventToSnapshot(snapshot, event, elapsed)
        break
    }
  })
}
