import { NodeType, PatchType, VTree } from '@repro/domain'
import { Box } from '@repro/tdl'
import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  applyDOMPatchEvent,
  createDOMFromVTree,
  replaceURLsInCSSText,
  resolveURLToResource,
} from './index'

// The renderer's resourceMap format is { absoluteURL: resourceId } — the
// inverse of createResourceMap's { resourceId: absoluteURL } format.
// Callers like NativeDOMRenderer.tsx invert the map before passing it in.

function makeVElement(
  id: string,
  children: Array<string> = [],
  shadowRoot: boolean = false
) {
  return new Box({
    type: NodeType.Element as any,
    id,
    parentId: null,
    tagName: 'div',
    children,
    attributes: {},
    properties: {
      checked: null,
      selectedIndex: null,
      value: null,
    },
    shadowRoot,
  })
}

function makeVShadowRoot(
  id: string,
  hostId: string,
  children: Array<string> = [],
  mode: string = 'open'
) {
  return new Box({
    type: NodeType.ShadowRoot as any,
    id,
    hostId,
    children,
    mode,
    adoptedStyleSheets: [],
  })
}

function makeVTree(rootId: string, nodes: VTree['nodes']): VTree {
  return { rootId, nodes }
}

describe('vdom-renderer: resolveURLToResource', () => {
  it('should resolve a URL to its resource ID path when present in map', () => {
    // resourceMap is { absoluteURL: resourceId } (inverted from createResourceMap)
    const resourceMap: Record<string, string> = {
      'http://example.com/icons.svg': 'abc1',
    }

    const result = resolveURLToResource(
      'http://example.com/icons.svg',
      'http://example.com/',
      '/resources/',
      resourceMap
    )

    assert.strictEqual(result, '/resources/abc1')
  })

  it('should return the absolute URL when not in the resource map', () => {
    const result = resolveURLToResource(
      'http://example.com/missing.png',
      'http://example.com/',
      '/resources/',
      {}
    )

    assert.strictEqual(result, 'http://example.com/missing.png')
  })

  it('should pass through hash-only URLs unchanged', () => {
    const result = resolveURLToResource(
      '#inline-symbol',
      'http://example.com/',
      '/resources/',
      {}
    )

    assert.strictEqual(result, '#inline-symbol')
  })
})

describe('vdom-renderer: replaceURLsInCSSText', () => {
  it('should replace url() references in CSS text with resource URLs', () => {
    // resourceMap is { absoluteURL: resourceId }
    const resourceMap: Record<string, string> = {
      'http://example.com/bg.png': 'img1',
    }

    const cssText = 'background-image: url("http://example.com/bg.png")'
    const result = replaceURLsInCSSText(
      cssText,
      'http://example.com/',
      '/resources/',
      resourceMap
    )

    assert.ok(
      result.includes('/resources/img1'),
      `Expected resource URL in: ${result}`
    )
  })

  it('should leave data URIs unchanged', () => {
    const dataURI = 'data:image/png;base64,abc123'
    const cssText = `background-image: url("${dataURI}")`
    const result = replaceURLsInCSSText(
      cssText,
      'http://example.com/',
      '/resources/',
      {}
    )

    assert.ok(
      result.includes(dataURI),
      `Expected data URI to be unchanged in: ${result}`
    )
  })

  it('should leave hash-only url() references unchanged', () => {
    // CSS filters can use hash references like url(#filter-id)
    const cssText = 'filter: url(#goo)'
    const result = replaceURLsInCSSText(
      cssText,
      'http://example.com/',
      '/resources/',
      {}
    )

    // Should not blow up, and should keep the hash reference
    assert.ok(
      result.includes('#goo'),
      `Expected hash ref unchanged in: ${result}`
    )
  })
})

describe('vdom-renderer: Gap 2 - <use> href resolution (renderer side)', () => {
  it('resolveURLToResource resolves base URL of external SVG sprite file', () => {
    // The resource map contains the base SVG URL (hash was stripped before
    // adding to the map). resourceMap is { absoluteURL: resourceId }.
    const resourceMap: Record<string, string> = {
      'http://example.com/icons.svg': 'svg1',
    }

    const result = resolveURLToResource(
      'http://example.com/icons.svg',
      'http://example.com/',
      '/resources/',
      resourceMap
    )

    assert.strictEqual(result, '/resources/svg1')
  })
})

describe('vdom-renderer: shadow DOM reconstruction', () => {
  it('createDOMFromVTree reconstructs a VShadowRoot on the host element', () => {
    const hostId = 'host-1'
    const shadowId = 'shadow-1'

    const vtree = makeVTree(hostId, {
      [hostId]: makeVElement(hostId, [], true),
      [shadowId]: makeVShadowRoot(shadowId, hostId, [], 'open'),
    })

    const [node] = createDOMFromVTree({
      vtree,
      doc: document,
      rootNodeMap: {},
      currentPageURL: 'http://example.com/',
      resourceBaseURL: '/resources/',
      resourceMap: {},
      isUnderStyleRoot: false,
    })

    assert.ok(node, 'root node should exist')
    assert.ok(isElementNode(node), 'root node should be an element')

    const host = node as HTMLElement
    assert.ok(host.shadowRoot, 'host should have a shadowRoot')
    const shadowRoot = host.shadowRoot as ShadowRoot
    assert.strictEqual(
      shadowRoot.mode,
      'open',
      'shadow root mode should be open'
    )
  })

  it('createDOMFromVTree renders shadow root children inside the shadow root', () => {
    const hostId = 'host-1'
    const shadowId = 'shadow-1'
    const childId = 'child-1'

    const vtree = makeVTree(hostId, {
      [hostId]: makeVElement(hostId, [], true),
      [shadowId]: makeVShadowRoot(shadowId, hostId, [childId], 'open'),
      [childId]: new Box({
        type: NodeType.Element as any,
        id: childId,
        parentId: shadowId,
        tagName: 'p',
        children: [],
        attributes: {},
        properties: { checked: null, selectedIndex: null, value: null },
        shadowRoot: false,
      }),
    })

    const [node] = createDOMFromVTree({
      vtree,
      doc: document,
      rootNodeMap: {},
      currentPageURL: 'http://example.com/',
      resourceBaseURL: '/resources/',
      resourceMap: {},
      isUnderStyleRoot: false,
    })

    const host = node as HTMLElement
    assert.ok(host.shadowRoot, 'host should have a shadowRoot')
    const sr = host.shadowRoot as ShadowRoot
    assert.strictEqual(
      sr.children.length,
      1,
      'shadow root should have one child'
    )
    assert.strictEqual(
      (sr.children[0] as HTMLElement).tagName,
      'P',
      'shadow root child should be a <p> element'
    )
    assert.strictEqual(
      host.children.length,
      0,
      'host element should have no direct children'
    )
  })

  it('applyDOMPatchEvent applies AddShadowRoot patch', () => {
    const hostId = 'host-1'
    const shadowId = 'shadow-1'
    const childId = 'child-1'

    // Start with a host element only
    const vtree = makeVTree(hostId, {
      [hostId]: makeVElement(hostId, [], false),
    })

    const [node, nodeMap] = createDOMFromVTree({
      vtree,
      doc: document,
      rootNodeMap: {},
      currentPageURL: 'http://example.com/',
      resourceBaseURL: '/resources/',
      resourceMap: {},
      isUnderStyleRoot: false,
    })

    const host = node as HTMLElement
    assert.strictEqual(
      host.shadowRoot,
      null,
      'host should not have shadow root yet'
    )

    // Apply AddShadowRoot patch
    const shadowVTree = makeVTree(shadowId, {
      [shadowId]: makeVShadowRoot(shadowId, hostId, [childId], 'open'),
      [childId]: new Box({
        type: NodeType.Element as any,
        id: childId,
        parentId: shadowId,
        tagName: 'span',
        children: [],
        attributes: {},
        properties: { checked: null, selectedIndex: null, value: null },
        shadowRoot: false,
      }),
    })

    const patchEvent = {
      data: new Box({
        type: PatchType.AddShadowRoot as any,
        hostId,
        shadowRoot: shadowVTree,
      }),
    }

    applyDOMPatchEvent(
      patchEvent as any,
      document,
      nodeMap,
      'http://example.com/',
      '/resources/',
      {}
    )

    assert.ok(host.shadowRoot, 'host should have a shadowRoot after patch')
    const sr = host.shadowRoot as ShadowRoot
    assert.strictEqual(
      sr.children.length,
      1,
      'shadow root should have one child'
    )
    assert.strictEqual(
      (sr.children[0] as HTMLElement).tagName,
      'SPAN',
      'shadow root child should be a <span> element'
    )
  })

  it('applies adoptedStyleSheets from VShadowRoot to the shadow root', () => {
    const hostId = 'host-1'
    const shadowId = 'shadow-1'

    const vtree = makeVTree(hostId, {
      [hostId]: makeVElement(hostId, [], true),
      [shadowId]: new Box({
        type: NodeType.ShadowRoot as any,
        id: shadowId,
        hostId,
        children: [],
        mode: 'open',
        adoptedStyleSheets: ['div { color: red; }'],
      }),
    })

    const [node] = createDOMFromVTree({
      vtree,
      doc: document,
      rootNodeMap: {},
      currentPageURL: 'http://example.com/',
      resourceBaseURL: '/resources/',
      resourceMap: {},
      isUnderStyleRoot: false,
    })

    const host = node as HTMLElement
    const sr = host.shadowRoot as ShadowRoot
    assert.ok(sr.firstChild, 'shadow root should have children')
    assert.strictEqual(
      (sr.firstChild as HTMLElement).tagName,
      'STYLE',
      'first child should be a style element for adopted stylesheets'
    )
    assert.ok(
      (sr.firstChild as HTMLElement).textContent?.includes('color: red'),
      'style element should contain the adopted CSS'
    )
  })

  it('applyDOMPatchEvent applies RemoveShadowRoot patch', () => {
    const hostId = 'host-1'
    const shadowId = 'shadow-1'
    const childId = 'child-1'

    // Start with a host that already has a shadow root with a child
    const vtree = makeVTree(hostId, {
      [hostId]: makeVElement(hostId, [], true),
      [shadowId]: makeVShadowRoot(shadowId, hostId, [childId], 'open'),
      [childId]: new Box({
        type: NodeType.Element as any,
        id: childId,
        parentId: shadowId,
        tagName: 'span',
        children: [],
        attributes: {},
        properties: { checked: null, selectedIndex: null, value: null },
        shadowRoot: false,
      }),
    })

    const shadowVTree = makeVTree(shadowId, {
      [shadowId]: makeVShadowRoot(shadowId, hostId, [childId], 'open'),
      [childId]: new Box({
        type: NodeType.Element as any,
        id: childId,
        parentId: shadowId,
        tagName: 'span',
        children: [],
        attributes: {},
        properties: { checked: null, selectedIndex: null, value: null },
        shadowRoot: false,
      }),
    })

    const [node, nodeMap] = createDOMFromVTree({
      vtree,
      doc: document,
      rootNodeMap: {},
      currentPageURL: 'http://example.com/',
      resourceBaseURL: '/resources/',
      resourceMap: {},
      isUnderStyleRoot: false,
    })

    const host = node as HTMLElement
    assert.ok(host.shadowRoot, 'host should have a shadowRoot initially')
    const sr = host.shadowRoot as ShadowRoot
    assert.strictEqual(
      sr.children.length,
      1,
      'shadow root should have one child initially'
    )

    // Apply RemoveShadowRoot patch
    const patchEvent = {
      data: new Box({
        type: PatchType.RemoveShadowRoot as any,
        hostId,
        shadowRootId: shadowId,
        shadowRoot: shadowVTree,
      }),
    }

    applyDOMPatchEvent(
      patchEvent as any,
      document,
      nodeMap,
      'http://example.com/',
      '/resources/',
      {}
    )

    // Shadow root object still exists (cannot be removed from DOM API)
    // but its children should be cleared
    assert.ok(host.shadowRoot, 'host should still have a shadowRoot object')
    assert.strictEqual(
      sr.children.length,
      0,
      'shadow root should have no children after remove'
    )
    assert.strictEqual(
      sr.firstChild,
      null,
      'shadow root should have no first child after remove'
    )
    assert.strictEqual(
      nodeMap[shadowId],
      undefined,
      'shadow root should be removed from nodeMap'
    )
    assert.strictEqual(
      nodeMap[childId],
      undefined,
      'shadow root child should be removed from nodeMap'
    )
  })
})

// Helper: check if a node is an ElementNode (used in the renderer)
function isElementNode(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE
}
