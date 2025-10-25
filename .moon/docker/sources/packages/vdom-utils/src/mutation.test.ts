import { NodeType, VElement, VText, VTree } from '@repro/domain'
import { Box } from '@repro/tdl'
import expect from 'expect'
import { describe, it } from 'node:test'
import { removeSubTreesAtNode } from './mutation'

describe('utils: vdom', () => {
  describe('removeSubTreesAtNode', () => {
    function createVTree(): VTree {
      return {
        rootId: '1',
        nodes: {
          1: new Box({
            id: '1',
            parentId: null,
            type: NodeType.Element,
            tagName: 'div',
            attributes: {},
            properties: {
              checked: null,
              selectedIndex: null,
              value: null,
            },
            children: ['2', '3', '4'],
            shadowRoot: false,
          }),

          2: new Box({
            id: '2',
            parentId: '1',
            type: NodeType.Element,
            tagName: 'span',
            attributes: {},
            properties: {
              checked: null,
              selectedIndex: null,
              value: null,
            },
            children: ['5'],
            shadowRoot: false,
          }),

          3: new Box({
            id: '3',
            parentId: '1',
            type: NodeType.Text,
            value: 'foo',
          }),

          4: new Box({
            id: '4',
            parentId: '1',
            type: NodeType.Text,
            value: 'bar',
          }),

          5: new Box({
            id: '5',
            parentId: '2',
            type: NodeType.Text,
            value: 'baz',
          }),
        },
      }
    }

    it('should remove subtrees from a valid parent node', () => {
      const vtree = createVTree()

      removeSubTreesAtNode(vtree, vtree.nodes['1']?.unwrap() as VElement, [
        {
          rootId: '2',
          nodes: {
            '2': vtree.nodes['2'] as Box<VElement>,
            '5': vtree.nodes['5'] as Box<VText>,
          },
        },
      ])

      expect(vtree).toEqual({
        rootId: '1',
        nodes: {
          1: new Box({
            id: '1',
            parentId: null,
            type: NodeType.Element,
            tagName: 'div',
            attributes: {},
            properties: {
              checked: null,
              selectedIndex: null,
              value: null,
            },
            children: ['3', '4'],
            shadowRoot: false,
          }),

          3: new Box({
            id: '3',
            parentId: '1',
            type: NodeType.Text,
            value: 'foo',
          }),

          4: new Box({
            id: '4',
            parentId: '1',
            type: NodeType.Text,
            value: 'bar',
          }),
        },
      })
    })

    it('should not remove subtrees from an invalid parent node', () => {
      const vtree = createVTree()

      removeSubTreesAtNode(vtree, vtree.nodes['2']?.unwrap() as VElement, [
        {
          rootId: '3',
          nodes: {
            '3': vtree.nodes['3'] as Box<VText>,
          },
        },
      ])

      expect(vtree).toEqual(createVTree())
    })

    it('should remove subtrees idempotently', () => {
      const vtree = createVTree()

      removeSubTreesAtNode(vtree, vtree.nodes['1']?.unwrap() as VElement, [
        {
          rootId: '2',
          nodes: {
            '2': vtree.nodes['2'] as Box<VElement>,
            '5': vtree.nodes['5'] as Box<VText>,
          },
        },
      ])

      removeSubTreesAtNode(vtree, vtree.nodes['1']?.unwrap() as VElement, [
        {
          rootId: '2',
          nodes: {
            '2': vtree.nodes['2'] as Box<VElement>,
            '5': vtree.nodes['5'] as Box<VText>,
          },
        },
      ])

      expect(vtree).toEqual({
        rootId: '1',
        nodes: {
          1: new Box({
            id: '1',
            parentId: null,
            type: NodeType.Element,
            tagName: 'div',
            attributes: {},
            properties: {
              checked: null,
              selectedIndex: null,
              value: null,
            },
            children: ['3', '4'],
            shadowRoot: false,
          }),

          3: new Box({
            id: '3',
            parentId: '1',
            type: NodeType.Text,
            value: 'foo',
          }),

          4: new Box({
            id: '4',
            parentId: '1',
            type: NodeType.Text,
            value: 'bar',
          }),
        },
      })
    })
  })
})
