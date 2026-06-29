import { DOMPatch, NodeType, PatchType } from '@repro/domain'
import { Box } from '@repro/tdl'
import { deepUnbox, MockNodeList } from '@repro/testing-utils'
import { getNodeId } from '@repro/vdom-utils'
import expect from 'expect'
import { describe, it } from 'node:test'
import { redactText } from '../redaction'
import { RecordingOptions } from '../types'
import { createDOMObserver, internal__processMutationRecords } from './observe'
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

  it('createDOMObserver.observe() is idempotent and supports disconnect → re-observe cycle', async () => {
    const patches: Array<DOMPatch> = []

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

    const observer = createDOMObserver(
      walkDOMTree,
      options,
      (patch: DOMPatch) => {
        patches.push(patch)
      }
    )

    // Call observe() twice — second call should be a no-op
    observer.observe(document, { rootId: 'foo', nodes: {} } as any)
    observer.observe(document, { rootId: 'foo', nodes: {} } as any)

    // Make a DOM mutation and flush microtasks for MutationObserver callback
    const el = document.createElement('div')
    document.body.appendChild(el)

    await new Promise(resolve => setTimeout(resolve, 5))

    const initialPatchCount = patches.length
    expect(initialPatchCount).toBeGreaterThan(0)

    // Disconnect and re-observe
    observer.disconnect()
    patches.length = 0

    observer.observe(document, { rootId: 'foo', nodes: {} } as any)

    // Make another mutation
    const el2 = document.createElement('span')
    document.body.appendChild(el2)

    await new Promise(resolve => setTimeout(resolve, 5))

    expect(patches.length).toBeGreaterThan(0)

    // Cleanup
    document.body.removeChild(el)
    document.body.removeChild(el2)
    observer.disconnect()
  })

  it('strict preset masks input value via attribute mutation when input is in maskedSelectors', () => {
    const patches: Array<DOMPatch> = []

    // Elements must be in the DOM for closest() to work in isMaskedBySelector
    const container = document.createElement('div')
    const input = document.createElement('input')
    input.setAttribute('type', 'text')
    // Set initial value that differs from oldValue so the mutation is detected
    input.setAttribute('value', 'new-value')
    container.appendChild(input)
    document.body.appendChild(container)

    const options: RecordingOptions = {
      types: new Set(['dom']),
      snapshotInterval: 10_000,
      ignoredNodes: [],
      ignoredSelectors: [],
      maskedSelectors: [
        '.repro-mask',
        'input',
        'textarea',
        'select',
        '[contenteditable]',
        'img',
      ],
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

    // Simulate an attribute mutation on the input value (oldValue differs from current)
    const records: Array<MutationRecord> = [
      {
        type: 'attributes',
        attributeName: 'value',
        attributeNamespace: null,
        oldValue: 'old-value',
        addedNodes: MockNodeList.empty(),
        removedNodes: MockNodeList.empty(),
        target: input,
        nextSibling: null,
        previousSibling: null,
      },
    ]

    internal__processMutationRecords(records, walkDOMTree, options, subscriber)

    // The value attribute mutation should be emitted and redacted via isMaskedBySelector
    const unboxed = deepUnbox(patches)
    expect(unboxed.length).toBeGreaterThan(0)
    if (unboxed[0]) {
      // Under strict preset, the value should be redacted (not the raw new-value)
      expect(
        unboxed[0] && 'oldValue' in unboxed[0]
          ? (unboxed[0] as any).oldValue
          : null
      ).toEqual(redactText('old-value'))
    }

    // Cleanup
    document.body.removeChild(container)
  })

  it('factory createVElement blanks img src when maskedSelectors includes img', () => {
    // Dynamic import since factory isn't imported at the top of this file
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const factory = require('./factory')

    const img = document.createElement('img')
    img.setAttribute('src', 'https://example.com/photo.jpg')

    const container = document.createElement('div')
    container.appendChild(img)
    document.body.appendChild(container)

    const strictSelectors = [
      '.repro-mask',
      'input',
      'textarea',
      'select',
      '[contenteditable]',
      'img',
    ]

    const vElement: Record<string, unknown> = factory.createVElement(img, {
      maskedSelectors: strictSelectors,
    })

    // With strict preset, img should have blank src
    expect(vElement.tagName).toBe('img')
    expect(vElement.attributes).toBeDefined()
    if (vElement.attributes) {
      expect((vElement.attributes as Record<string, string>).src).toBe('')
    }

    // Cleanup
    document.body.removeChild(container)
  })

  it('factory createVElement does NOT blank img src when maskedSelectors does NOT include img', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const factory = require('./factory')

    const img = document.createElement('img')
    img.setAttribute('src', 'https://example.com/photo.jpg')

    const container = document.createElement('div')
    container.appendChild(img)
    document.body.appendChild(container)

    const standardSelectors = ['.repro-mask']

    const vElement: Record<string, unknown> = factory.createVElement(img, {
      maskedSelectors: standardSelectors,
    })

    // Without img in maskedSelectors, src should be preserved
    expect(vElement.tagName).toBe('img')
    expect(vElement.attributes).toBeDefined()
    if (vElement.attributes) {
      expect((vElement.attributes as Record<string, string>).src).toBe(
        'https://example.com/photo.jpg'
      )
    }

    // Cleanup
    document.body.removeChild(container)
  })
})
