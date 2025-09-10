import { Stats, StatsLevel } from '@repro/diagnostics'
import {
  isInputElement,
  isSelectElement,
  isTextAreaElement,
  maskValue,
} from '@repro/dom-utils'
import {
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
import { RecordingOptions } from '../types'
import { DOMTreeWalker, isIgnoredByNode, isIgnoredBySelector } from './utils'

export function createDOMObserver(
  walkDOMTree: DOMTreeWalker,
  options: RecordingOptions,
  subscriber: (patch: DOMPatch) => void
): ObserverLike {
  const domObserver = createMutationObserver(walkDOMTree, options, subscriber)
  const styleSheetObserver = createStyleSheetObserver(subscriber)
  const inputObserver = createInputObserver(subscriber)

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
  subscriber: (patch: DOMPatch) => void
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

      if (eventTarget.type === 'password') {
        maskedInputs.add(eventTarget)
      }

      if (maskedInputs.has(eventTarget)) {
        oldValue = maskValue(oldValue)
        value = maskValue(value)
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
  subscriber: (patch: DOMPatch) => void
) {
  const patches: Array<DOMPatch> = []
  const addedNodes = new Set<SyntheticId>()

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

        if (attribute?.value !== record.oldValue) {
          patches.push(
            new Box({
              type: PatchType.Attribute,
              targetId,
              name,
              value: attribute ? attribute.value : null,
              oldValue: record.oldValue,
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
            value: (record.target as Text).data,
            oldValue: record.oldValue || '',
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
  const domObserver = new MutationObserver(records => {
    Stats.time(
      'DOMObserver~processMutationRecords',
      () => {
        internal__processMutationRecords(
          records,
          walkDOMTree,
          options,
          subscriber
        )
      },
      StatsLevel.Debug
    )
  })

  return {
    disconnect: () => domObserver.disconnect(),
    observe(doc) {
      domObserver.observe(doc, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeOldValue: true,
        characterData: true,
        characterDataOldValue: true,
      })
    },
  }
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

  const targets = new Set<Window & typeof globalThis>()

  return {
    disconnect() {
      for (const win of targets) {
        win.CSSStyleSheet.prototype.insertRule = insertRule
        win.CSSStyleSheet.prototype.deleteRule = deleteRule
      }
    },

    observe(doc, vtree) {
      const win = doc.defaultView

      if (win) {
        targets.add(win)

        win.CSSStyleSheet.prototype.insertRule = function (this, ...args) {
          insertRuleEffect(vtree, this, ...args)
          return insertRule.call(this, ...args)
        }

        win.CSSStyleSheet.prototype.deleteRule = function (this, ...args) {
          deleteRuleEffect(vtree, this, ...args)
          return deleteRule.call(this, ...args)
        }
      }
    },
  }
}
