import { DOMPatch, NodeType, PatchType } from '@repro/domain'
import { deepUnbox, MockNodeList } from '@repro/testing-utils'
import { getNodeId } from '@repro/vdom-utils'
import expect from 'expect'
import { describe, it } from 'node:test'
import { RecordingOptions } from '../types'
import { internal__processMutationRecords } from './observe'
import { createDOMTreeWalker } from './utils'
import { createDOMVisitor } from './visitor'

function unwrapValue(value: any): any {
  return value && typeof value === 'object' && 'value' in value
    ? unwrapValue(value.value)
    : value
}

describe('libs/record: dom observers', () => {
  it('should correctly process an attribute mutation record', () => {
    const patches: Array<DOMPatch> = []

    const target = document.createElement('div')
    target.setAttribute('class', 'foo')

    const records: Array<MutationRecord> = [
      {
        type: 'attributes',
        attributeName: 'class',
        attributeNamespace: null,
        oldValue: null,
        addedNodes: MockNodeList.empty(),
        removedNodes: MockNodeList.empty(),
        target,
        nextSibling: null,
        previousSibling: null,
      },
    ]

    const options: RecordingOptions = {
      types: new Set(['dom']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: [],
      eventSampling: {
        pointerMove: 50,
        resize: 250,
        scroll: 100,
      },
    }

    const walkDOMTree = createDOMTreeWalker(options)

    const subscriber = (patch: DOMPatch) => {
      patches.push(patch)
    }

    internal__processMutationRecords(records, walkDOMTree, options, subscriber)

    expect(deepUnbox(patches)).toEqual([
      {
        type: PatchType.Attribute,
        targetId: getNodeId(target),
        name: 'class',
        value: 'foo',
        oldValue: null,
      },
    ])
  })

  it('should correctly process a characterData mutation', () => {
    const patches: Array<DOMPatch> = []

    const target = document.createTextNode('bar')

    const records: Array<MutationRecord> = [
      {
        type: 'characterData',
        attributeName: null,
        attributeNamespace: null,
        oldValue: 'foo',
        addedNodes: MockNodeList.empty(),
        removedNodes: MockNodeList.empty(),
        target,
        nextSibling: null,
        previousSibling: null,
      },
    ]

    const options: RecordingOptions = {
      types: new Set(['dom']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: [],
      eventSampling: {
        pointerMove: 50,
        resize: 250,
        scroll: 100,
      },
    }

    const walkDOMTree = createDOMTreeWalker(options)

    const subscriber = (patch: DOMPatch) => {
      patches.push(patch)
    }

    internal__processMutationRecords(records, walkDOMTree, options, subscriber)

    expect(deepUnbox(patches)).toEqual([
      {
        type: PatchType.Text,
        targetId: getNodeId(target),
        value: 'bar',
        oldValue: 'foo',
        parentId: null,
      },
    ])
  })

  it('should correctly process childList mutation records', () => {
    const patches: Array<DOMPatch> = []

    const target = document.createElement('div')
    const added = document.createElement('div')
    const removed = document.createElement('div')

    const records: Array<MutationRecord> = [
      {
        type: 'childList',
        attributeName: null,
        attributeNamespace: null,
        oldValue: null,
        addedNodes: MockNodeList.from([]),
        removedNodes: MockNodeList.from([removed]),
        target,
        nextSibling: null,
        previousSibling: null,
      },
      {
        type: 'childList',
        attributeName: null,
        attributeNamespace: null,
        oldValue: null,
        addedNodes: MockNodeList.from([added]),
        removedNodes: MockNodeList.from([]),
        target,
        nextSibling: null,
        previousSibling: null,
      },
    ]

    const options: RecordingOptions = {
      types: new Set(['dom']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: [],
      eventSampling: {
        pointerMove: 50,
        resize: 250,
        scroll: 100,
      },
    }

    const walkDOMTree = createDOMTreeWalker(options)
    walkDOMTree.acceptDOMVisitor(createDOMVisitor())

    const subscriber = (patch: DOMPatch) => {
      patches.push(patch)
    }

    internal__processMutationRecords(records, walkDOMTree, options, subscriber)

    expect(deepUnbox(patches)).toEqual([
      {
        type: PatchType.RemoveNodes,
        parentId: getNodeId(target),
        previousSiblingId: null,
        nextSiblingId: null,
        nodes: [
          {
            rootId: getNodeId(removed),
            nodes: {
              [getNodeId(removed)]: {
                id: getNodeId(removed),
                parentId: null,
                type: NodeType.Element,
                tagName: 'div',
                attributes: {},
                properties: {
                  checked: null,
                  selectedIndex: null,
                  value: null,
                },
                children: [],
                shadowRoot: false,
              },
            },
          },
        ],
      },
      {
        type: PatchType.AddNodes,
        parentId: getNodeId(target),
        previousSiblingId: null,
        nextSiblingId: null,
        nodes: [
          {
            rootId: getNodeId(added),
            nodes: {
              [getNodeId(added)]: {
                id: getNodeId(added),
                parentId: null,
                type: NodeType.Element,
                tagName: 'div',
                attributes: {},
                properties: {
                  checked: null,
                  selectedIndex: null,
                  value: null,
                },
                children: [],
                shadowRoot: false,
              },
            },
          },
        ],
      },
    ])
  })

  it('masks text mutations inside rr-mask subtrees without ignoring them', () => {
    const patches: Array<DOMPatch> = []

    const target = document.createTextNode('secret')
    const maskedRoot = document.createElement('div')
    maskedRoot.className = 'rr-mask'
    maskedRoot.append(target)

    const records: Array<MutationRecord> = [
      {
        type: 'characterData',
        attributeName: null,
        attributeNamespace: null,
        oldValue: 'old secret',
        addedNodes: MockNodeList.empty(),
        removedNodes: MockNodeList.empty(),
        target,
        nextSibling: null,
        previousSibling: null,
      },
    ]

    const options: RecordingOptions = {
      types: new Set(['dom']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: ['.rr-ignore'],
      eventSampling: {
        pointerMove: 50,
        resize: 250,
        scroll: 100,
      },
    }

    const walkDOMTree = createDOMTreeWalker(options)
    walkDOMTree.acceptDOMVisitor(createDOMVisitor())

    const subscriber = (patch: DOMPatch) => {
      patches.push(patch)
    }

    internal__processMutationRecords(records, walkDOMTree, options, subscriber)

    expect(patches).toEqual([
      new Box({
        type: PatchType.Text,
        targetId: getNodeId(target),
        value: '[MASKED]',
        oldValue: '[MASKED]',
        parentId: getNodeId(maskedRoot),
      }),
    ])
  })

  it('preserves rr-mask structure while excluding rr-ignore subtrees in snapshots', () => {
    const options: RecordingOptions = {
      types: new Set(['dom']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: ['.rr-ignore'],
      eventSampling: {
        pointerMove: 50,
        resize: 250,
        scroll: 100,
      },
    }

    const maskedRoot = document.createElement('section')
    maskedRoot.className = 'rr-mask'
    const maskedText = document.createTextNode('secret')
    maskedRoot.append(maskedText)

    const ignoredRoot = document.createElement('section')
    ignoredRoot.className = 'rr-ignore'
    ignoredRoot.append(document.createTextNode('ignored'))

    document.body.append(maskedRoot, ignoredRoot)

    const walkDOMTree = createDOMTreeWalker(options)
    const visitor = createDOMVisitor()
    walkDOMTree.acceptDOMVisitor(visitor)

    const vtree = walkDOMTree(document)

    expect(vtree).not.toBeNull()
    const values = Object.values(vtree?.nodes ?? {}).map(node => {
      return unwrapValue((node as any).value)
    })

    expect(values).toContain('[MASKED]')
    expect(
      values.some(node => {
        return node?.attributes?.class === 'rr-ignore'
      })
    ).toBe(false)

    document.body.removeChild(maskedRoot)
    document.body.removeChild(ignoredRoot)
  })
})
