import { computeSpecificity } from '@repro/css-utils'
import { Stats, StatsLevel } from '@repro/diagnostics'
import {
  isInputElement,
  isLocalStylesheet,
  isSelectElement,
  isTextAreaElement,
} from '@repro/dom-utils'
import {
  CapturedCSSRule,
  DOMPatch,
  NodeType,
  PatchType,
  SyntheticId,
  VTree,
} from '@repro/domain'
import { ObserverLike, createEventObserver } from '@repro/observer-utils'
import { Box } from '@repro/tdl'
import { Immutable } from '@repro/ts-utils'
import { createSyntheticId, getNodeId, isElementVNode } from '@repro/vdom-utils'
import { redactText } from '../redaction'
import { RecordingOptions } from '../types'
import {
  DOMTreeWalker,
  isIgnoredByNode,
  isIgnoredBySelector,
  isMaskedBySelector,
} from './utils'

export function createDOMObserver(
  walkDOMTree: DOMTreeWalker,
  options: RecordingOptions,
  subscriber: (patch: DOMPatch) => void
): ObserverLike {
  const domObserver = createMutationObserver(walkDOMTree, options, subscriber)
  const styleSheetObserver = createStyleSheetObserver(subscriber)
  const inputObserver = createInputObserver(subscriber, options)

  return {
    disconnect() {
      domObserver.disconnect()
      styleSheetObserver.disconnect()
      inputObserver.disconnect()
    },

    observe(doc, vtree) {
      domObserver.observe(doc, vtree)
      styleSheetObserver.observe(doc, vtree)
      inputObserver.observe(doc, vtree)
    },
  }
}

function createInputObserver(
  subscriber: (patch: DOMPatch) => void,
  options: RecordingOptions
): ObserverLike<Document> {
  let prevChangeMap = new WeakMap<EventTarget, string>()
  let prevCheckedMap = new WeakMap<EventTarget, boolean>()
  let prevSelectedIndexMap = new WeakMap<EventTarget, number>()
  let maskedInputs = new WeakSet<EventTarget>()

  const handleChangeOrInput = (evt: Event) => {
    const eventTarget = evt.target as Node
    const isInput = isInputElement(eventTarget)
    const isTextArea = isTextAreaElement(eventTarget)
    const isSelect = isSelectElement(eventTarget)

    if (isInput || isTextArea || isSelect) {
      // TODO: read prev value from vtree
      let oldValue =
        prevChangeMap.get(eventTarget) ||
        ('defaultValue' in eventTarget ? eventTarget.defaultValue : '')

      let value = eventTarget.value
      const isMasked = isMaskedBySelector(eventTarget, options.maskedSelectors)

      if (eventTarget.type === 'password') {
        maskedInputs.add(eventTarget)
      }

      if (isMasked) {
        oldValue = redactText(oldValue)
        value = redactText(value)
      } else if (maskedInputs.has(eventTarget)) {
        oldValue = redactText(oldValue)
        value = redactText(value)
      }

      if (eventTarget.value !== oldValue) {
        subscriber(
          new Box({
            type: PatchType.TextProperty,
            targetId: getNodeId(eventTarget),
            name: 'value',
            value,
            oldValue,
          })
        )

        prevChangeMap.set(eventTarget, value)
      }
    }

    if (isInput) {
      const inputType = eventTarget.type

      if (inputType === 'checkbox' || inputType === 'radio') {
        // TODO: read prev checked state from vtree
        const prevChecked = prevCheckedMap.get(eventTarget) || false

        subscriber(
          new Box({
            type: PatchType.BooleanProperty,
            targetId: getNodeId(eventTarget),
            name: 'checked',
            value: eventTarget.checked,
            oldValue: prevChecked,
          })
        )

        prevCheckedMap.set(eventTarget, eventTarget.checked)
      }

      if (inputType === 'radio') {
        if (eventTarget.parentElement) {
          const siblingInputs = eventTarget.parentElement.querySelectorAll(
            `input[type="radio"][name="${eventTarget.name}"]`
          )

          for (const sibling of Array.from(siblingInputs)) {
            if (sibling !== eventTarget) {
              const prevChecked = prevCheckedMap.get(sibling) || false

              subscriber(
                new Box({
                  type: PatchType.BooleanProperty,
                  targetId: getNodeId(sibling),
                  name: 'checked',
                  value: false,
                  oldValue: prevChecked,
                })
              )

              prevCheckedMap.set(sibling, false)
            }
          }
        }
      }
    }

    if (isSelect) {
      // TODO: read previous selected index from vtree
      const prevSelectedIndex = prevSelectedIndexMap.get(eventTarget) || -1

      subscriber(
        new Box({
          type: PatchType.NumberProperty,
          targetId: getNodeId(eventTarget),
          name: 'selectedIndex',
          value: eventTarget.selectedIndex,
          oldValue: prevSelectedIndex,
        })
      )

      prevSelectedIndexMap.set(eventTarget, eventTarget.selectedIndex)
    }
  }

  // const changeObserver = createEventObserver('change', handleChangeOrInput)
  const inputObserver = createEventObserver('input', handleChangeOrInput)

  const propertyOverrides = [
    [HTMLInputElement.prototype, 'value'],
    [HTMLInputElement.prototype, 'checked'],
    [HTMLSelectElement.prototype, 'value'],
    [HTMLTextAreaElement.prototype, 'value'],
    [HTMLSelectElement.prototype, 'selectedIndex'],
  ] as const

  const originalPropertyDescriptors = propertyOverrides.map(([obj, name]) =>
    Object.getOwnPropertyDescriptor(obj, name)
  )

  return {
    disconnect() {
      propertyOverrides.forEach(([obj, name], i) => {
        const descriptor = originalPropertyDescriptors[i]

        if (descriptor) {
          Object.defineProperty(obj, name, descriptor)
        }

        // @ts-ignore
        delete obj[`__original__${name}`]
      })

      // changeObserver.disconnect()
      inputObserver.disconnect()

      prevChangeMap = new WeakMap()
      prevCheckedMap = new WeakMap()
      prevSelectedIndexMap = new WeakMap()
    },

    observe(doc, vtree) {
      // TODO: make vtree available to enclosing scope
      // changeObserver.observe(doc, vtree)
      inputObserver.observe(doc, vtree)

      propertyOverrides.forEach(([obj, name], i) => {
        const descriptor = originalPropertyDescriptors[i]

        if (descriptor) {
          Object.defineProperty(obj, `__original__${name}`, descriptor)
        }

        Object.defineProperty(obj, name, {
          set(value: any) {
            if (descriptor && descriptor.set) {
              descriptor.set.call(this, value)
            }

            handleChangeOrInput({ target: this } as Event)
          },
        })
      })
    },
  }
}

export function internal__processMutationRecords(
  records: Array<MutationRecord>,
  walkDOMTree: DOMTreeWalker,
  options: RecordingOptions,
  subscriber: (patch: DOMPatch) => void,
  onShadowRootDiscovered?: (shadowRoot: ShadowRoot) => void
) {
  const patches: Array<DOMPatch> = []
  const addedNodes = new Set<SyntheticId>()

  if (onShadowRootDiscovered) {
    walkDOMTree.accept({
      elementNode(element) {
        if (element.shadowRoot && element.shadowRoot.mode !== 'closed') {
          onShadowRootDiscovered(element.shadowRoot)
        }
      },
      textNode() {},
      shadowRootNode() {},
      documentNode() {},
      documentTypeNode() {},
      documentFragmentNode() {},
      done() {},
    })
  }

  for (const record of records) {
    if (isIgnoredByNode(record.target, options.ignoredNodes)) {
      continue
    }

    if (isIgnoredBySelector(record.target, options.ignoredSelectors)) {
      continue
    }

    switch (record.type) {
      case 'attributes':
        const targetId = getNodeId(record.target)

        if (addedNodes.has(targetId)) {
          break
        }

        const name = record.attributeName as string
        const attribute = (record.target as Element).attributes.getNamedItem(
          name
        )
        const isMasked =
          name === 'value' &&
          isMaskedBySelector(record.target as Node, options.maskedSelectors)

        if (attribute?.value !== record.oldValue) {
          patches.push(
            new Box({
              type: PatchType.Attribute,
              targetId,
              name,
              value: attribute
                ? isMasked
                  ? redactText(attribute.value)
                  : attribute.value
                : null,
              oldValue: isMasked
                ? record.oldValue === null
                  ? null
                  : redactText(record.oldValue)
                : record.oldValue,
            })
          )
        }

        break

      case 'characterData':
        if (addedNodes.has(getNodeId(record.target))) {
          break
        }

        const parentNode = record.target.parentNode

        patches.push(
          new Box({
            type: PatchType.Text,
            targetId: getNodeId(record.target),
            value: isMaskedBySelector(record.target, options.maskedSelectors)
              ? redactText((record.target as Text).data)
              : (record.target as Text).data,
            oldValue: isMaskedBySelector(record.target, options.maskedSelectors)
              ? redactText(record.oldValue || '')
              : record.oldValue || '',
            parentId: parentNode ? getNodeId(parentNode) : null,
          })
        )

        break

      case 'childList':
        // TODO: optimization - handle moving nodes without destroying vnode

        const removedVTrees: Array<VTree> = []
        record.removedNodes.forEach(node => {
          if (
            !isIgnoredBySelector(node, options.ignoredSelectors) &&
            !isIgnoredByNode(node, options.ignoredNodes)
          ) {
            const vtree = walkDOMTree(node)

            if (vtree != null) {
              removedVTrees.push(vtree)
            }
          }
        })

        const addedVTrees: Array<VTree> = []
        record.addedNodes.forEach(node => {
          if (
            !isIgnoredBySelector(node, options.ignoredSelectors) &&
            !isIgnoredByNode(node, options.ignoredNodes)
          ) {
            const vtree = walkDOMTree(node)

            if (vtree != null) {
              addedVTrees.push(vtree)
            }
          }
        })

        let previousSibling = record.previousSibling

        while (
          previousSibling &&
          (isIgnoredBySelector(previousSibling, options.ignoredSelectors) ||
            isIgnoredByNode(previousSibling, options.ignoredNodes))
        ) {
          previousSibling = previousSibling.previousSibling
        }

        let nextSibling = record.nextSibling

        while (
          nextSibling &&
          (isIgnoredBySelector(nextSibling, options.ignoredSelectors) ||
            isIgnoredByNode(nextSibling, options.ignoredNodes))
        ) {
          nextSibling = nextSibling.nextSibling
        }

        if (removedVTrees.length) {
          for (const vtree of removedVTrees) {
            for (const nodeId of Object.keys(vtree.nodes)) {
              addedNodes.delete(nodeId)
            }
          }

          patches.push(
            new Box({
              type: PatchType.RemoveNodes,
              parentId: getNodeId(record.target),
              previousSiblingId:
                previousSibling !== null ? getNodeId(previousSibling) : null,
              nextSiblingId:
                nextSibling !== null ? getNodeId(nextSibling) : null,
              nodes: removedVTrees,
            })
          )
        }

        if (addedVTrees.length) {
          outer: {
            for (const vtree of addedVTrees) {
              if (addedNodes.has(vtree.rootId)) {
                break outer
              }
            }

            for (const vtree of addedVTrees) {
              for (const nodeId of Object.keys(vtree.nodes)) {
                addedNodes.add(nodeId)
              }
            }

            patches.push(
              new Box({
                type: PatchType.AddNodes,
                parentId: getNodeId(record.target),
                previousSiblingId:
                  previousSibling !== null ? getNodeId(previousSibling) : null,
                nextSiblingId:
                  nextSibling !== null ? getNodeId(nextSibling) : null,
                nodes: addedVTrees,
              })
            )
          }
        }

        break
    }

    // Detect text mutations on <style> element children — emit CSS rule patches
    if (
      record.type === 'characterData' ||
      (record.type === 'childList' &&
        (record.addedNodes.length > 0 || record.removedNodes.length > 0))
    ) {
      const targetParent =
        record.type === 'characterData'
          ? (record.target as Text).parentNode
          : record.target
      if (
        targetParent &&
        targetParent instanceof Element &&
        isLocalStylesheet(targetParent as Element)
      ) {
        const sheet = (targetParent as HTMLStyleElement).sheet
        if (sheet) {
          try {
            emitTextBasedCSSPatch(subscriber, sheet)
          } catch {
            // sheet.cssRules may throw SecurityError for cross-origin sheets
          }
        }
      }
    }
  }

  for (const patch of patches) {
    subscriber(patch)
  }
}

function createMutationObserver(
  walkDOMTree: DOMTreeWalker,
  options: RecordingOptions,
  subscriber: (patch: DOMPatch) => void
): ObserverLike<Document> {
  const observers: Array<MutationObserver> = []
  let origAttachShadow: typeof Element.prototype.attachShadow | null = null
  const adoptedStyleSheetCleanups = new Set<() => void>()
  let isProcessingMutations = false

  walkDOMTree.accept({
    elementNode(element) {
      if (
        isProcessingMutations &&
        element.shadowRoot &&
        element.shadowRoot.mode !== 'closed'
      ) {
        onShadowRootDiscovered(element.shadowRoot)
      }
    },
    textNode() {},
    shadowRootNode() {},
    documentNode() {},
    documentTypeNode() {},
    documentFragmentNode() {},
    done() {},
  })

  function createObserverForRoot(root: Node): MutationObserver {
    const observer = new MutationObserver(records => {
      Stats.time(
        'DOMObserver~processMutationRecords',
        () => {
          isProcessingMutations = true
          try {
            internal__processMutationRecords(
              records,
              walkDOMTree,
              options,
              subscriber
            )
          } finally {
            isProcessingMutations = false
          }
        },
        StatsLevel.Debug
      )
    })

    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      characterData: true,
      characterDataOldValue: true,
    })

    observers.push(observer)
    return observer
  }

  // Walk the tree rooted at `root` and create MutationObservers for any
  // open shadow roots discovered.
  function discoverAndObserveShadows(root: Node) {
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      null
    )
    let element: Element | null
    while ((element = walker.nextNode() as Element | null)) {
      if (element.shadowRoot && element.shadowRoot.mode !== 'closed') {
        observeAdoptedStyleSheets(element.shadowRoot)
        createObserverForRoot(element.shadowRoot)
        // Recurse into the shadow root to find nested shadow roots
        discoverAndObserveShadows(element.shadowRoot)
      }
    }
  }

  function onShadowRootDiscovered(shadowRoot: ShadowRoot) {
    observeAdoptedStyleSheets(shadowRoot)
    createObserverForRoot(shadowRoot)
    discoverAndObserveShadows(shadowRoot)
  }

  function observeAdoptedStyleSheets(shadowRoot: ShadowRoot) {
    const descriptor = Object.getOwnPropertyDescriptor(
      ShadowRoot.prototype,
      'adoptedStyleSheets'
    )
    if (!descriptor?.set) return

    const origSetter = descriptor.set
    Object.defineProperty(shadowRoot, 'adoptedStyleSheets', {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: descriptor.get,
      set(this: ShadowRoot, sheets: StyleSheetList) {
        origSetter.call(this, sheets)

        const adoptedStyleSheets: Array<string> = Array.from(sheets)
          .map(sheet => {
            try {
              return Array.from(sheet.cssRules)
                .map(r => r.cssText)
                .join('\n')
            } catch {
              return ''
            }
          })
          .filter(Boolean)

        if (adoptedStyleSheets.length > 0) {
          subscriber(
            new Box({
              type: PatchType.UpdateAdoptedStyleSheets,
              hostId: getNodeId(this.host),
              shadowRootId: getNodeId(this),
              adoptedStyleSheets,
            })
          )
        }
      },
    })

    adoptedStyleSheetCleanups.add(() => {
      Object.defineProperty(shadowRoot, 'adoptedStyleSheets', {
        configurable: descriptor.configurable,
        enumerable: descriptor.enumerable,
        get: descriptor.get,
        set: descriptor.set,
      })
    })
  }

  return {
    disconnect() {
      for (const observer of observers) {
        observer.disconnect()
      }
      observers.length = 0

      if (origAttachShadow) {
        Element.prototype.attachShadow = origAttachShadow
        origAttachShadow = null
      }

      for (const cleanup of adoptedStyleSheetCleanups) {
        cleanup()
      }
      adoptedStyleSheetCleanups.clear()
    },

    observe(doc) {
      origAttachShadow = Element.prototype.attachShadow

      // Monkey-patch Element.prototype.attachShadow to intercept open
      // shadow root creation at runtime.
      Element.prototype.attachShadow = function (
        this: Element,
        init: ShadowRootInit
      ) {
        const shadowRoot = origAttachShadow!.call(this, init)

        if (init.mode === 'open' && shadowRoot) {
          // Walk the shadow tree and emit an addShadowRoot patch.
          const shadowVTree = walkDOMTree(shadowRoot)
          if (shadowVTree) {
            subscriber(
              new Box({
                type: PatchType.AddShadowRoot,
                hostId: getNodeId(this),
                shadowRoot: shadowVTree,
              })
            )
          }

          // Create observer for the new shadow root.
          observeAdoptedStyleSheets(shadowRoot)
          createObserverForRoot(shadowRoot)
          discoverAndObserveShadows(shadowRoot)
        }

        return shadowRoot
      }

      createObserverForRoot(doc)
      discoverAndObserveShadows(doc)
    },
  }
}

const adoptedSheetIdsForObserver = new WeakMap<CSSStyleSheet, string>()
const sheetRuleCounts = new WeakMap<CSSStyleSheet, number>()

function getStyleSheetId(sheet: CSSStyleSheet): string {
  if (sheet.ownerNode) {
    return getNodeId(sheet.ownerNode)
  }
  let id = adoptedSheetIdsForObserver.get(sheet)
  if (!id) {
    id = createSyntheticId()
    adoptedSheetIdsForObserver.set(sheet, id)
  }
  return id
}

function emitInsertRulePatch(
  subscriber: (patch: DOMPatch) => void,
  sheet: CSSStyleSheet,
  index: number
) {
  const rule = sheet.cssRules[index]
  if (!(rule instanceof CSSStyleRule)) return

  const style = rule.style
  const declarations: Record<string, string> = {}
  const priorities: Record<string, string> = {}

  for (let j = 0; j < style.length; j++) {
    const prop = style[j]
    if (!prop) continue
    declarations[prop] = style.getPropertyValue(prop).trim()
    const priority = style.getPropertyPriority(prop)
    priorities[prop] = priority === 'important' ? 'important' : ''
  }

  const stylesheetId = getStyleSheetId(sheet)
  const selectors = rule.selectorText.split(',').map(s => s.trim())

  const capturedRules: CapturedCSSRule[] = selectors.map(selectorText => {
    const [a, b, c] = computeSpecificity(selectorText)
    return {
      selectorText,
      declarations,
      priorities,
      specificity: { a, b, c },
      stylesheetId,
      ruleIndex: index,
      mediaCondition: null,
      supportsCondition: null,
      isInline: false,
      importInaccessible: false,
    }
  })

  subscriber(
    new Box({
      type: PatchType.StyleSheetMutation,
      stylesheetId,
      insertedRules: capturedRules,
      deletedRuleIndex: null,
      replaceText: null,
    })
  )
}

function emitDeleteRulePatch(
  subscriber: (patch: DOMPatch) => void,
  sheet: CSSStyleSheet,
  index: number
) {
  const stylesheetId = getStyleSheetId(sheet)

  subscriber(
    new Box({
      type: PatchType.StyleSheetMutation,
      stylesheetId,
      insertedRules: null,
      deletedRuleIndex: index,
      replaceText: null,
    })
  )
}

function emitTextBasedCSSPatch(
  subscriber: (patch: DOMPatch) => void,
  sheet: CSSStyleSheet
) {
  const stylesheetId = getStyleSheetId(sheet)
  const currentCount = sheet.cssRules.length
  const previousCount = sheetRuleCounts.get(sheet) ?? 0

  if (currentCount > previousCount) {
    // Emit only the newly added rules (not rules that were already present)
    const newRules: CapturedCSSRule[] = []
    for (let i = previousCount; i < currentCount; i++) {
      const rule = sheet.cssRules[i]
      if (rule instanceof CSSStyleRule) {
        const style = rule.style
        const declarations: Record<string, string> = {}
        const priorities: Record<string, string> = {}
        for (let j = 0; j < style.length; j++) {
          const prop = style[j]
          if (!prop) continue
          declarations[prop] = style.getPropertyValue(prop).trim()
          const priority = style.getPropertyPriority(prop)
          priorities[prop] = priority === 'important' ? 'important' : ''
        }
        const selectors = rule.selectorText.split(',').map(s => s.trim())
        selectors.forEach(selectorText => {
          const [a, b, c] = computeSpecificity(selectorText)
          newRules.push({
            selectorText,
            declarations,
            priorities,
            specificity: { a, b, c },
            stylesheetId,
            ruleIndex: i,
            mediaCondition: null,
            supportsCondition: null,
            isInline: false,
            importInaccessible: false,
          })
        })
      }
    }
    if (newRules.length > 0) {
      subscriber(
        new Box({
          type: PatchType.StyleSheetMutation,
          stylesheetId,
          insertedRules: newRules,
          deletedRuleIndex: null,
          replaceText: null,
        })
      )
    }
  }

  sheetRuleCounts.set(sheet, currentCount)
}

function createStyleSheetObserver(
  subscriber: (patch: DOMPatch) => void
): ObserverLike<Document> {
  function insertRuleEffect(
    vtree: Immutable<VTree>,
    sheet: CSSStyleSheet,
    rule: string,
    index: number = 0
  ) {
    if (sheet.ownerNode) {
      const parentId = getNodeId(sheet.ownerNode)
      const parentVNode = vtree.nodes[parentId]

      if (parentVNode && isElementVNode(parentVNode)) {
        let previousSiblingId: string | null = null
        let nextSiblingId: string | null = null

        parentVNode.apply(parentVNode => {
          previousSiblingId = parentVNode.children[index - 1] || null
          nextSiblingId = parentVNode.children[index] || null
        })

        const id = createSyntheticId()

        subscriber(
          new Box({
            type: PatchType.AddNodes,
            parentId,
            previousSiblingId,
            nextSiblingId,
            nodes: [
              {
                rootId: id,
                nodes: {
                  [id]: new Box({
                    type: NodeType.Text,
                    id,
                    parentId,
                    value: rule,
                  }),
                },
              },
            ],
          })
        )
      }
    }
  }

  function deleteRuleEffect(vtree: VTree, sheet: CSSStyleSheet, index: number) {
    if (sheet.ownerNode) {
      const parentId = getNodeId(sheet.ownerNode)
      const parentVNode = vtree.nodes[parentId]

      if (parentVNode && isElementVNode(parentVNode)) {
        parentVNode.apply(parentVNode => {
          const previousSiblingId = parentVNode.children[index - 1] || null
          const nextSiblingId = parentVNode.children[index + 1] || null
          const id = parentVNode.children[index] || null

          if (id) {
            const node = vtree.nodes[id]

            if (node) {
              subscriber(
                new Box({
                  type: PatchType.RemoveNodes,
                  parentId,
                  previousSiblingId,
                  nextSiblingId,
                  nodes: [
                    {
                      rootId: id,
                      nodes: {
                        [id]: node,
                      },
                    },
                  ],
                })
              )
            }
          }
        })
      }
    }
  }

  const insertRule = window.CSSStyleSheet.prototype.insertRule
  const deleteRule = window.CSSStyleSheet.prototype.deleteRule
  const replaceSync = window.CSSStyleSheet.prototype.replaceSync
  const replace = window.CSSStyleSheet.prototype.replace

  const targets = new Set<Window & typeof globalThis>()

  return {
    disconnect() {
      for (const win of targets) {
        win.CSSStyleSheet.prototype.insertRule = insertRule
        win.CSSStyleSheet.prototype.deleteRule = deleteRule
        if (replaceSync) {
          win.CSSStyleSheet.prototype.replaceSync = replaceSync
        }
        if (replace) {
          win.CSSStyleSheet.prototype.replace = replace
        }
      }
    },

    observe(doc, vtree) {
      const win = doc.defaultView

      if (win) {
        targets.add(win)

        win.CSSStyleSheet.prototype.insertRule = function (this, ...args) {
          const resultIndex = insertRule.call(this, ...args)
          insertRuleEffect(vtree, this, ...args)
          emitInsertRulePatch(subscriber, this, resultIndex)
          return resultIndex
        }

        win.CSSStyleSheet.prototype.deleteRule = function (this, ...args) {
          const index = args[0] ?? 0
          emitDeleteRulePatch(subscriber, this, index)
          deleteRuleEffect(vtree, this, ...args)
          return deleteRule.call(this, ...args)
        }

        if (replaceSync) {
          win.CSSStyleSheet.prototype.replaceSync = function (
            this: CSSStyleSheet,
            text: string
          ) {
            const stylesheetId = getStyleSheetId(this)
            replaceSync!.call(this, text)
            subscriber(
              new Box({
                type: PatchType.StyleSheetMutation,
                stylesheetId,
                insertedRules: null,
                deletedRuleIndex: null,
                replaceText: text,
              })
            )
          }
        }

        if (replace) {
          win.CSSStyleSheet.prototype.replace = function (
            this: CSSStyleSheet,
            text: string
          ): Promise<CSSStyleSheet> {
            const stylesheetId = getStyleSheetId(this)
            return replace!.call(this, text).then(sheet => {
              subscriber(
                new Box({
                  type: PatchType.StyleSheetMutation,
                  stylesheetId,
                  insertedRules: null,
                  deletedRuleIndex: null,
                  replaceText: text,
                })
              )
              return sheet
            })
          }
        }
      }
    },
  }
}
