import { NodeType, PatchType, VTree } from '@repro/domain'
import { Box } from '@repro/tdl'
import expect from 'expect'
import { describe, it } from 'node:test'
import { createNodeId } from './id-factory'
import { isShadowRootVNode } from './matchers'
import {
  addShadowRootToVTree,
  applyVTreePatch,
  removeShadowRootFromVTree,
} from './mutation'

function makeVTree(rootId: string, nodes: VTree['nodes']): VTree {
  return { rootId, nodes }
}

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

describe('VShadowRoot mutations', () => {
  describe('addShadowRootToVTree', () => {
    it('adds shadow root VTree to the parent VTree', () => {
      const hostId = createNodeId()
      const shadowId = createNodeId()
      const childId = createNodeId()

      const vtree = makeVTree(hostId, {
        [hostId]: makeVElement(hostId, [], false),
      })

      const shadowVTree: VTree = {
        rootId: shadowId,
        nodes: {
          [shadowId]: makeVShadowRoot(shadowId, hostId, [childId]),
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
        },
      }

      addShadowRootToVTree(vtree, hostId, shadowVTree)

      // Host should now have shadowRoot = true
      const hostNode = vtree.nodes[hostId]
      hostNode!.apply(node => {
        expect((node as any).shadowRoot).toBe(true)
      })

      // Shadow root node should be present
      const shadowNode = vtree.nodes[shadowId]
      expect(shadowNode).toBeTruthy()
      expect(isShadowRootVNode(shadowNode!)).toBe(true)

      // Child of shadow should also be present
      const childNode = vtree.nodes[childId]
      expect(childNode).toBeTruthy()
    })

    it('sets shadowRoot flag to true on host element', () => {
      const hostId = createNodeId()
      const shadowId = createNodeId()

      const vtree = makeVTree(hostId, {
        [hostId]: makeVElement(hostId, [], false),
      })

      const shadowVTree: VTree = {
        rootId: shadowId,
        nodes: {
          [shadowId]: makeVShadowRoot(shadowId, hostId),
        },
      }

      addShadowRootToVTree(vtree, hostId, shadowVTree)

      const hostNode = vtree.nodes[hostId]
      hostNode!.apply(node => {
        expect((node as any).shadowRoot).toBe(true)
      })
    })
  })

  describe('removeShadowRootFromVTree', () => {
    it('removes shadow root and all descendants from VTree', () => {
      const hostId = createNodeId()
      const shadowId = createNodeId()
      const childId = createNodeId()

      const vtree = makeVTree(hostId, {
        [hostId]: makeVElement(hostId, [], true),
        [shadowId]: makeVShadowRoot(shadowId, hostId, [childId]),
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

      removeShadowRootFromVTree(vtree, hostId, shadowId)

      // Shadow root should be removed
      expect(vtree.nodes[shadowId]).toBeUndefined()

      // Child should also be removed (cascade)
      expect(vtree.nodes[childId]).toBeUndefined()

      // Host should have shadowRoot = false
      const hostNode = vtree.nodes[hostId]
      hostNode!.apply(node => {
        expect((node as any).shadowRoot).toBe(false)
      })
    })

    it('sets shadowRoot flag to false on host element', () => {
      const hostId = createNodeId()
      const shadowId = createNodeId()

      const vtree = makeVTree(hostId, {
        [hostId]: makeVElement(hostId, [], true),
        [shadowId]: makeVShadowRoot(shadowId, hostId),
      })

      removeShadowRootFromVTree(vtree, hostId, shadowId)

      const hostNode = vtree.nodes[hostId]
      hostNode!.apply(node => {
        expect((node as any).shadowRoot).toBe(false)
      })
    })
  })

  describe('applyVTreePatch for shadow root patches', () => {
    it('applies AddShadowRoot patch', () => {
      const hostId = createNodeId()
      const shadowId = createNodeId()

      const vtree = makeVTree(hostId, {
        [hostId]: makeVElement(hostId, [], false),
      })

      const shadowVTree: VTree = {
        rootId: shadowId,
        nodes: {
          [shadowId]: makeVShadowRoot(shadowId, hostId),
        },
      }

      const patch = new Box({
        type: PatchType.AddShadowRoot as any,
        hostId,
        shadowRoot: shadowVTree,
      })

      applyVTreePatch(vtree, patch)

      expect(vtree.nodes[shadowId]).toBeTruthy()
      const hostNode = vtree.nodes[hostId]
      hostNode!.apply(node => {
        expect((node as any).shadowRoot).toBe(true)
      })
    })

    it('reverts AddShadowRoot patch', () => {
      const hostId = createNodeId()
      const shadowId = createNodeId()

      const vtree = makeVTree(hostId, {
        [hostId]: makeVElement(hostId, [], false),
      })

      const shadowVTree: VTree = {
        rootId: shadowId,
        nodes: {
          [shadowId]: makeVShadowRoot(shadowId, hostId),
        },
      }

      const patch = new Box({
        type: PatchType.AddShadowRoot as any,
        hostId,
        shadowRoot: shadowVTree,
      })

      applyVTreePatch(vtree, patch)
      applyVTreePatch(vtree, patch, true) // revert

      expect(vtree.nodes[shadowId]).toBeUndefined()
      const hostNode = vtree.nodes[hostId]
      hostNode!.apply(node => {
        expect((node as any).shadowRoot).toBe(false)
      })
    })

    it('applies RemoveShadowRoot patch', () => {
      const hostId = createNodeId()
      const shadowId = createNodeId()

      const shadowVTree: VTree = {
        rootId: shadowId,
        nodes: {
          [shadowId]: makeVShadowRoot(shadowId, hostId),
        },
      }

      const vtree = makeVTree(hostId, {
        [hostId]: makeVElement(hostId, [], true),
        [shadowId]: makeVShadowRoot(shadowId, hostId),
      })

      const patch = new Box({
        type: PatchType.RemoveShadowRoot as any,
        hostId,
        shadowRootId: shadowId,
        shadowRoot: shadowVTree,
      })

      applyVTreePatch(vtree, patch)

      expect(vtree.nodes[shadowId]).toBeUndefined()
      const hostNode = vtree.nodes[hostId]
      hostNode!.apply(node => {
        expect((node as any).shadowRoot).toBe(false)
      })
    })

    it('reverts RemoveShadowRoot patch (restores shadow root)', () => {
      const hostId = createNodeId()
      const shadowId = createNodeId()

      const shadowVTree: VTree = {
        rootId: shadowId,
        nodes: {
          [shadowId]: makeVShadowRoot(shadowId, hostId),
        },
      }

      // Start with the shadow root already in the VTree.
      const vtree = makeVTree(hostId, {
        [hostId]: makeVElement(hostId, [], true),
        [shadowId]: makeVShadowRoot(shadowId, hostId),
      })

      const patch = new Box({
        type: PatchType.RemoveShadowRoot as any,
        hostId,
        shadowRootId: shadowId,
        shadowRoot: shadowVTree,
      })

      applyVTreePatch(vtree, patch) // apply remove
      expect(vtree.nodes[shadowId]).toBeUndefined()

      applyVTreePatch(vtree, patch, true) // revert

      // Shadow root should be restored
      expect(vtree.nodes[shadowId]).toBeTruthy()
      const hostNode = vtree.nodes[hostId]
      hostNode!.apply(node => {
        expect((node as any).shadowRoot).toBe(true)
      })
    })
  })
})

describe('isShadowRootVNode matcher', () => {
  it('identifies VShadowRoot nodes', () => {
    const id = createNodeId()
    const hostId = createNodeId()
    const shadowNode = makeVShadowRoot(id, hostId)
    expect(isShadowRootVNode(shadowNode)).toBe(true)
  })

  it('does not identify VElement nodes', () => {
    const id = createNodeId()
    const elementNode = makeVElement(id)
    expect(isShadowRootVNode(elementNode)).toBe(false)
  })
})
