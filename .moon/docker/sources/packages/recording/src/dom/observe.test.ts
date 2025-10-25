import { DOMPatch, NodeType, PatchType } from '@repro/domain'
import { Box } from '@repro/tdl'
import { MockNodeList } from '@repro/testing-utils'
import { getNodeId } from '@repro/vdom-utils'
import expect from 'expect'
import { describe, it } from 'node:test'
import { RecordingOptions } from '../types'
import { internal__processMutationRecords } from './observe'
import { createDOMTreeWalker } from './utils'
import { createDOMVisitor } from './visitor'

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

    expect(patches).toEqual([
      new Box({
        type: PatchType.Attribute,
        targetId: getNodeId(target),
        name: 'class',
        value: 'foo',
        oldValue: null,
      }),
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

    expect(patches).toEqual([
      new Box({
        type: PatchType.Text,
        targetId: getNodeId(target),
        value: 'bar',
        oldValue: 'foo',
        parentId: null,
      }),
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

    expect(patches).toEqual([
      new Box({
        type: PatchType.RemoveNodes,
        parentId: getNodeId(target),
        previousSiblingId: null,
        nextSiblingId: null,
        nodes: [
          {
            rootId: getNodeId(removed),
            nodes: {
              [getNodeId(removed)]: new Box({
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
              }),
            },
          },
        ],
      }),
      new Box({
        type: PatchType.AddNodes,
        parentId: getNodeId(target),
        previousSiblingId: null,
        nextSiblingId: null,
        nodes: [
          {
            rootId: getNodeId(added),
            nodes: {
              [getNodeId(added)]: new Box({
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
              }),
            },
          },
        ],
      }),
    ])
  })
})
