import {
  NodeType,
  PatchType,
  SourceEvent,
  SourceEventType,
  VTree,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import expect from 'expect'
import { describe, it } from 'node:test'
import { createResourceMap, filterResourceMap } from './resources'

// Helper to create a SnapshotEvent wrapping a VTree
function makeSnapshotEvent(dom: VTree): SourceEvent {
  return new Box({
    type: SourceEventType.Snapshot,
    time: 0,
    data: {
      dom,
      frameworkState: null,
      cssRules: null,
      colorScheme: null,
      interaction: null,
    },
  })
}

// Helper to create a DOMPatch attribute event
function makeAttributePatchEvent(
  targetId: string,
  name: string,
  value: string | null
): SourceEvent {
  return new Box({
    type: SourceEventType.DOMPatch,
    time: 100,
    data: new Box({
      type: PatchType.Attribute,
      targetId,
      name,
      value,
      oldValue: null,
    }),
  })
}

function makeElementNode(
  id: string,
  tagName: string,
  attributes: { [key: string]: string | null } = {},
  children: string[] = [],
  parentId: string | null = null
) {
  return new Box({
    id,
    parentId,
    type: NodeType.Element as NodeType.Element,
    tagName,
    attributes,
    properties: { checked: null, selectedIndex: null, value: null },
    children,
    shadowRoot: false,
    slotAssignments: null,
  })
}

function makeTextNode(
  id: string,
  value: string,
  parentId: string | null = null
) {
  return new Box({
    id,
    parentId,
    type: NodeType.Text as NodeType.Text,
    value,
  })
}

describe('vdom-utils: resources', () => {
  describe('filterResourceMap', () => {
    it('should only include provided resource IDs in resource map', () => {
      const resourceMap: { [key: string]: string } = {
        foo: 'http://example.com/foo',
        bar: 'http://example.com/bar',
        baz: 'http://example.com/baz',
      }

      expect(filterResourceMap(resourceMap, ['foo', 'baz'])).toEqual({
        foo: 'http://example.com/foo',
        baz: 'http://example.com/baz',
      })
    })
  })

  describe('createResourceMap', () => {
    describe('Gap 2: SVG <use> external href references', () => {
      it('should capture external SVG sprite href on <use> elements', () => {
        const vtree: VTree = {
          rootId: 'root',
          nodes: {
            root: makeElementNode('root', 'svg', {}, ['use1']),
            use1: makeElementNode(
              'use1',
              'use',
              { href: 'http://example.com/icons.svg#arrow' },
              [],
              'root'
            ),
          },
        }

        const events: SourceEvent[] = [makeSnapshotEvent(vtree)]
        const resourceMap = createResourceMap(events)

        const values = Object.values(resourceMap)
        expect(values).toContain('http://example.com/icons.svg')
      })

      it('should capture external SVG sprite xlink:href on <use> elements', () => {
        const vtree: VTree = {
          rootId: 'root',
          nodes: {
            root: makeElementNode('root', 'svg', {}, ['use1']),
            use1: makeElementNode(
              'use1',
              'use',
              { 'xlink:href': 'http://example.com/sprites.svg#icon-home' },
              [],
              'root'
            ),
          },
        }

        const events: SourceEvent[] = [makeSnapshotEvent(vtree)]
        const resourceMap = createResourceMap(events)

        const values = Object.values(resourceMap)
        expect(values).toContain('http://example.com/sprites.svg')
      })

      it('should NOT capture pure hash href on <use> elements (inline symbol refs)', () => {
        const vtree: VTree = {
          rootId: 'root',
          nodes: {
            root: makeElementNode('root', 'svg', {}, ['use1']),
            use1: makeElementNode(
              'use1',
              'use',
              { href: '#inline-symbol' },
              [],
              'root'
            ),
          },
        }

        const events: SourceEvent[] = [makeSnapshotEvent(vtree)]
        const resourceMap = createResourceMap(events)

        const values = Object.values(resourceMap)
        // pure hash refs should not be captured
        expect(values.every(v => !v.startsWith('#'))).toBe(true)
        expect(values.length).toBe(0)
      })

      it('should strip the hash fragment when capturing external SVG use href', () => {
        const vtree: VTree = {
          rootId: 'root',
          nodes: {
            root: makeElementNode('root', 'svg', {}, ['use1']),
            use1: makeElementNode(
              'use1',
              'use',
              { href: 'http://example.com/icons.svg#arrow' },
              [],
              'root'
            ),
          },
        }

        const events: SourceEvent[] = [makeSnapshotEvent(vtree)]
        const resourceMap = createResourceMap(events)

        const values = Object.values(resourceMap)
        expect(values).toContain('http://example.com/icons.svg')
        // should not include the hash fragment
        expect(values.every(v => !v.includes('#'))).toBe(true)
      })
    })

    describe('Gap 3: Dynamic style attribute patches with url() references', () => {
      it('should capture url() references in style attribute patches', () => {
        const vtree: VTree = {
          rootId: 'root',
          nodes: {
            root: makeElementNode('root', 'div', {}, ['el1']),
            el1: makeElementNode('el1', 'div', {}, [], 'root'),
          },
        }

        const events: SourceEvent[] = [
          makeSnapshotEvent(vtree),
          makeAttributePatchEvent(
            'el1',
            'style',
            'background-image: url("http://example.com/bg.png")'
          ),
        ]

        const resourceMap = createResourceMap(events)
        const values = Object.values(resourceMap)
        expect(values).toContain('http://example.com/bg.png')
      })

      it('should NOT capture src attribute patches through style path (handled separately)', () => {
        // Ensure existing src patch handling still works independently
        const vtree: VTree = {
          rootId: 'root',
          nodes: {
            root: makeElementNode('root', 'div', {}, ['img1']),
            img1: makeElementNode('img1', 'img', {}, [], 'root'),
          },
        }

        const events: SourceEvent[] = [
          makeSnapshotEvent(vtree),
          makeAttributePatchEvent(
            'img1',
            'src',
            'http://example.com/photo.jpg'
          ),
        ]

        const resourceMap = createResourceMap(events)
        const values = Object.values(resourceMap)
        expect(values).toContain('http://example.com/photo.jpg')
      })

      it('should not capture url() references in style patches that are data URIs', () => {
        const dataURI = 'data:image/png;base64,abc123'
        const vtree: VTree = {
          rootId: 'root',
          nodes: {
            root: makeElementNode('root', 'div', {}, ['el1']),
            el1: makeElementNode('el1', 'div', {}, [], 'root'),
          },
        }

        const events: SourceEvent[] = [
          makeSnapshotEvent(vtree),
          makeAttributePatchEvent(
            'el1',
            'style',
            `background-image: url("${dataURI}")`
          ),
        ]

        const resourceMap = createResourceMap(events)
        const values = Object.values(resourceMap)
        // data URIs should not be in resource map
        expect(values.every(v => !v.startsWith('data:'))).toBe(true)
      })
    })

    describe('Gap 1: CSS @import in stylesheet text nodes', () => {
      it('should capture URLs from @import statements in style text nodes', () => {
        const vtree: VTree = {
          rootId: 'root',
          nodes: {
            root: makeElementNode('root', 'head', {}, ['style1']),
            style1: makeElementNode('style1', 'style', {}, ['text1'], 'root'),
            text1: makeTextNode(
              'text1',
              '@import "https://fonts.example.com/font.css"; body { color: red; }',
              'style1'
            ),
          },
        }

        const events: SourceEvent[] = [makeSnapshotEvent(vtree)]
        const resourceMap = createResourceMap(events)

        const values = Object.values(resourceMap)
        expect(values).toContain('https://fonts.example.com/font.css')
      })

      it('should capture URLs from @import url() syntax in style text nodes', () => {
        const vtree: VTree = {
          rootId: 'root',
          nodes: {
            root: makeElementNode('root', 'head', {}, ['style1']),
            style1: makeElementNode('style1', 'style', {}, ['text1'], 'root'),
            text1: makeTextNode(
              'text1',
              "@import url('https://cdn.example.com/theme.css'); .foo { background: url(https://cdn.example.com/img.png); }",
              'style1'
            ),
          },
        }

        const events: SourceEvent[] = [makeSnapshotEvent(vtree)]
        const resourceMap = createResourceMap(events)

        const values = Object.values(resourceMap)
        expect(values).toContain('https://cdn.example.com/theme.css')
        // existing url() in CSS rules should still be captured
        expect(values).toContain('https://cdn.example.com/img.png')
      })

      it('should capture @import with single quotes in style text nodes', () => {
        const vtree: VTree = {
          rootId: 'root',
          nodes: {
            root: makeElementNode('root', 'head', {}, ['style1']),
            style1: makeElementNode('style1', 'style', {}, ['text1'], 'root'),
            text1: makeTextNode(
              'text1',
              "@import 'https://cdn.example.com/reset.css';",
              'style1'
            ),
          },
        }

        const events: SourceEvent[] = [makeSnapshotEvent(vtree)]
        const resourceMap = createResourceMap(events)

        const values = Object.values(resourceMap)
        expect(values).toContain('https://cdn.example.com/reset.css')
      })
    })
  })
})
