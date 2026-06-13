import { DOMPatch, NodeType, PatchType } from '@repro/domain'
import { Box } from '@repro/tdl'
import { deepUnbox, MockNodeList } from '@repro/testing-utils'
import { getNodeId } from '@repro/vdom-utils'
import expect from 'expect'
import { describe, it } from 'node:test'
import { redactText } from '../redaction'
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
      maskedSelectors: [],
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
      maskedSelectors: [],
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
      maskedSelectors: [],
      eventSampling: {
        pointerMove: 50,
        resize: 250,
        scroll: 100,
      },
    }

    const walkDOMTree = createDOMTreeWalker(options)
    walkDOMTree.acceptDOMVisitor(createDOMVisitor(options))

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
                slotAssignments: null,
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
                slotAssignments: null,
              },
            },
          },
        ],
      },
    ])
  })

  it('masks text mutations inside selector-masked subtrees without ignoring them', () => {
    const patches: Array<DOMPatch> = []

    const target = document.createTextNode('secret')
    const maskedRoot = document.createElement('div')
    maskedRoot.className = 'repro-mask'
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
      maskedSelectors: ['.repro-mask'],
      eventSampling: {
        pointerMove: 50,
        resize: 250,
        scroll: 100,
      },
    }

    const walkDOMTree = createDOMTreeWalker(options)
    walkDOMTree.acceptDOMVisitor(createDOMVisitor(options))

    const subscriber = (patch: DOMPatch) => {
      patches.push(patch)
    }

    internal__processMutationRecords(records, walkDOMTree, options, subscriber)

    expect(patches).toEqual([
      new Box({
        type: PatchType.Text,
        targetId: getNodeId(target),
        value: '******',
        oldValue: '*** ******',
        parentId: getNodeId(maskedRoot),
      }),
    ])
  })

  it('preserves selector-masked structure while excluding rr-ignore subtrees in snapshots', () => {
    const options: RecordingOptions = {
      types: new Set(['dom']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: ['.rr-ignore'],
      maskedSelectors: ['.repro-mask'],
      eventSampling: {
        pointerMove: 50,
        resize: 250,
        scroll: 100,
      },
    }

    const maskedRoot = document.createElement('section')
    maskedRoot.className = 'repro-mask'
    const maskedText = document.createTextNode('secret')
    maskedRoot.append(maskedText)

    const maskedOption = document.createElement('option')
    maskedOption.value = 'secret-option'
    maskedOption.setAttribute('value', 'secret-option')
    maskedOption.textContent = 'public label'
    maskedRoot.append(maskedOption)

    const ignoredRoot = document.createElement('section')
    ignoredRoot.className = 'rr-ignore'
    ignoredRoot.append(document.createTextNode('ignored'))

    document.body.append(maskedRoot, ignoredRoot)

    const walkDOMTree = createDOMTreeWalker(options)
    const visitor = createDOMVisitor(options)
    walkDOMTree.acceptDOMVisitor(visitor)

    const vtree = walkDOMTree(document)

    expect(vtree).not.toBeNull()
    const values = Object.values(vtree?.nodes ?? {}).map(node => {
      return unwrapValue((node as any).value)
    })

    expect(values).toContain(redactText('secret'))

    const maskedTextValue = values.find(
      value => typeof value === 'string' && value === redactText('secret')
    )
    expect(maskedTextValue).toBe(redactText('secret'))

    const optionNode = Object.values(vtree?.nodes ?? {})
      .map(node => unwrapValue((node as any).value))
      .find(node => node?.tagName === 'option') as any

    expect(optionNode?.attributes?.value).toBe(redactText('secret-option'))

    expect(
      values.some(node => {
        return node?.attributes?.class === 'rr-ignore'
      })
    ).toBe(false)

    document.body.removeChild(maskedRoot)
    document.body.removeChild(ignoredRoot)
  })

  it('emits StyleSheetMutationPatch when textContent is set on a <style> element', () => {
    const patches: Array<DOMPatch> = []

    const style = document.createElement('style')
    document.head.appendChild(style)

    // Setting textContent causes jsdom to parse CSS and populate sheet.cssRules
    style.textContent = 'h1 { color: red; }'
    const textNode = style.firstChild as Text

    const records: Array<MutationRecord> = [
      {
        type: 'characterData',
        attributeName: null,
        attributeNamespace: null,
        oldValue: '',
        addedNodes: MockNodeList.empty(),
        removedNodes: MockNodeList.empty(),
        target: textNode,
        nextSibling: null,
        previousSibling: null,
      },
    ]

    const options: RecordingOptions = {
      types: new Set(['dom']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: [],
      maskedSelectors: [],
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

    const styleSheetPatches = deepUnbox(patches).filter(
      (p: any): p is any => p.type === PatchType.StyleSheetMutation
    ) as Array<any>

    expect(styleSheetPatches.length).toBeGreaterThan(0)
    const lastPatch = styleSheetPatches[styleSheetPatches.length - 1]!
    expect(lastPatch.insertedRules).toBeDefined()
    const h1Rules = lastPatch.insertedRules.filter(
      (r: any) => r.selectorText === 'h1'
    )
    expect(h1Rules.length).toBe(1)
    expect(h1Rules[0].declarations.color).toBe('red')

    document.head.removeChild(style)
  })

  it('emits StyleSheetMutationPatch when text node is appended to a <style> element', () => {
    const patches: Array<DOMPatch> = []

    const style = document.createElement('style')
    document.head.appendChild(style)

    // Emotion/Glamor dev mode pattern: appendChild(createTextNode(rule))
    const textNode = document.createTextNode('h1 { color: blue; }')
    style.appendChild(textNode)

    const records: Array<MutationRecord> = [
      {
        type: 'childList',
        attributeName: null,
        attributeNamespace: null,
        oldValue: null,
        addedNodes: MockNodeList.from([textNode]),
        removedNodes: MockNodeList.from([]),
        target: style,
        nextSibling: null,
        previousSibling: null,
      },
    ]

    const options: RecordingOptions = {
      types: new Set(['dom']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: [],
      maskedSelectors: [],
      eventSampling: {
        pointerMove: 50,
        resize: 250,
        scroll: 100,
      },
    }

    const walkDOMTree = createDOMTreeWalker(options)
    walkDOMTree.acceptDOMVisitor(createDOMVisitor(options))

    const subscriber = (patch: DOMPatch) => {
      patches.push(patch)
    }

    internal__processMutationRecords(records, walkDOMTree, options, subscriber)

    const styleSheetPatches = deepUnbox(patches).filter(
      (p: any): p is any => p.type === PatchType.StyleSheetMutation
    ) as Array<any>
    expect(styleSheetPatches.length).toBeGreaterThan(0)
    const lastPatch = styleSheetPatches[styleSheetPatches.length - 1]!
    expect(lastPatch.insertedRules).toBeDefined()
    const h1Rules = lastPatch.insertedRules.filter(
      (r: any) => r.selectorText === 'h1'
    )
    expect(h1Rules.length).toBe(1)
    expect(h1Rules[0].declarations.color).toBe('blue')

    document.head.removeChild(style)
  })

  it('does not emit StyleSheetMutationPatch for text mutations outside <style> elements', () => {
    const patches: Array<DOMPatch> = []

    const div = document.createElement('div')
    document.body.appendChild(div)
    div.textContent = 'hello world'
    const textNode = div.firstChild as Text

    const records: Array<MutationRecord> = [
      {
        type: 'characterData',
        attributeName: null,
        attributeNamespace: null,
        oldValue: '',
        addedNodes: MockNodeList.empty(),
        removedNodes: MockNodeList.empty(),
        target: textNode,
        nextSibling: null,
        previousSibling: null,
      },
    ]

    const options: RecordingOptions = {
      types: new Set(['dom']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: [],
      maskedSelectors: [],
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

    const styleSheetPatches = deepUnbox(patches).filter(
      (p: any) => p.type === PatchType.StyleSheetMutation
    )
    expect(styleSheetPatches.length).toBe(0)

    document.body.removeChild(div)
  })
})
