import { DOMPatch, NodeType, PatchType } from '@repro/domain'
import { MockNodeList } from '@repro/testing-utils'
import { getNodeId } from '@repro/vdom-utils'
import expect from 'expect'
import { describe, it } from 'node:test'
import { createVShadowRoot } from './factory'
import { createDOMObserver, internal__processMutationRecords } from './observe'
import { createDOMTreeWalker, isIgnoredByNode } from './utils'
import { createDOMVisitor } from './visitor'

/** Unwrap a Box-wrapped TDL union value via its `apply` method. */
function unwrapBox<T>(box: unknown): T | null {
  let val: T | null = null
  ;(box as any).apply?.((v: T) => {
    val = v
  })
  return val
}

function createRecordingOptions() {
  return {
    types: new Set(['dom'] as const),
    snapshotInterval: 10_000,
    ignoredNodes: [] as Array<Node>,
    ignoredSelectors: [] as Array<string>,
    maskedSelectors: [] as Array<string>,
    eventSampling: {
      pointerMove: 50,
      resize: 250,
      scroll: 100,
    },
  }
}

describe('Shadow DOM recording', () => {
  describe('Tree walker traverses into open shadow roots', () => {
    it('visits shadow root and its children during DOM walk', () => {
      const options = createRecordingOptions()
      const walkDOMTree = createDOMTreeWalker(options)
      const visitor = createDOMVisitor(options)
      walkDOMTree.acceptDOMVisitor(visitor)

      // Create a host element with an open shadow root
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const shadowChild = document.createElement('p')
      shadowChild.textContent = 'hello shadow'
      shadow.appendChild(shadowChild)

      document.body.appendChild(host)

      const vtree = walkDOMTree(document)
      expect(vtree).not.toBeNull()

      // The VTree should contain a VShadowRoot node
      const nodes = Object.values(vtree!.nodes)
      const shadowVNodes = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((n: any) => n && n.type === NodeType.ShadowRoot)

      expect(shadowVNodes.length).toBeGreaterThanOrEqual(1)

      // The shadow root should reference the host
      const shadowVNode = shadowVNodes[0]
      expect(shadowVNode.hostId).toBe(getNodeId(host))
      expect(shadowVNode.mode).toBe('open')

      // Shadow child should be present
      const textValues = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter(
          (n: any) =>
            n && n.type === NodeType.Text && n.value === 'hello shadow'
        )
      expect(textValues.length).toBe(1)

      document.body.removeChild(host)
    })

    it('does not traverse into closed shadow roots', () => {
      const options = createRecordingOptions()
      const walkDOMTree = createDOMTreeWalker(options)
      const visitor = createDOMVisitor(options)
      walkDOMTree.acceptDOMVisitor(visitor)

      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'closed' })
      const shadowChild = document.createElement('p')
      shadowChild.textContent = 'hidden'
      shadow.appendChild(shadowChild)
      document.body.appendChild(host)

      const vtree = walkDOMTree(document)
      expect(vtree).not.toBeNull()

      // No VShadowRoot should appear for closed shadow roots
      const nodes = Object.values(vtree!.nodes)
      const shadowVNodes = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((n: any) => n && n.type === NodeType.ShadowRoot)

      expect(shadowVNodes.length).toBe(0)

      // No shadow child text should appear
      const textValues = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter(
          (n: any) => n && n.type === NodeType.Text && n.value === 'hidden'
        )
      expect(textValues.length).toBe(0)

      document.body.removeChild(host)
    })

    it('traverses nested shadow roots', () => {
      const options = createRecordingOptions()
      const walkDOMTree = createDOMTreeWalker(options)
      const visitor = createDOMVisitor(options)
      walkDOMTree.acceptDOMVisitor(visitor)

      // Outer host
      const outerHost = document.createElement('div')
      const outerShadow = outerHost.attachShadow({ mode: 'open' })

      // Inner host inside outer shadow
      const innerHost = document.createElement('span')
      const innerShadow = innerHost.attachShadow({ mode: 'open' })
      const innerChild = document.createElement('em')
      innerChild.textContent = 'deep'
      innerShadow.appendChild(innerChild)
      outerShadow.appendChild(innerHost)

      document.body.appendChild(outerHost)

      const vtree = walkDOMTree(document)
      expect(vtree).not.toBeNull()

      // Both shadow roots should be present
      const nodes = Object.values(vtree!.nodes)
      const shadowVNodes = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((n: any) => n && n.type === NodeType.ShadowRoot)

      expect(shadowVNodes.length).toBe(2)

      // Deep text should be found
      const textValues = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((n: any) => n && n.type === NodeType.Text && n.value === 'deep')
      expect(textValues.length).toBe(1)

      document.body.removeChild(outerHost)
    })
  })

  describe('isIgnoredByNode handles shadow roots', () => {
    it('excludes shadow root when host is in ignoredNodes', () => {
      const options = createRecordingOptions()

      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const shadowChild = document.createElement('p')
      shadowChild.textContent = 'should be excluded'
      shadow.appendChild(shadowChild)
      document.body.appendChild(host)

      options.ignoredNodes = [host]
      const walkDOMTree = createDOMTreeWalker(options)
      const visitor = createDOMVisitor(options)
      walkDOMTree.acceptDOMVisitor(visitor)

      const vtree = walkDOMTree(document)
      expect(vtree).not.toBeNull()

      // Shadow content should NOT appear
      const nodes = Object.values(vtree!.nodes)
      const shadowVNodes = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((n: any) => n && n.type === NodeType.ShadowRoot)
      expect(shadowVNodes.length).toBe(0)

      const textValues = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter(
          (n: any) =>
            n && n.type === NodeType.Text && n.value === 'should be excluded'
        )
      expect(textValues.length).toBe(0)

      document.body.removeChild(host)
    })
  })

  describe('createVShadowRoot factory', () => {
    it('produces correct VShadowRoot struct', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })

      const vShadow = createVShadowRoot(shadow)

      expect(vShadow.type).toBe(NodeType.ShadowRoot)
      expect(vShadow.hostId).toBe(getNodeId(host))
      expect(vShadow.mode).toBe('open')
      expect(Array.isArray(vShadow.children)).toBe(true)
      expect(Array.isArray(vShadow.adoptedStyleSheets)).toBe(true)
    })

    it('produces correct id for shadow root', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })

      const vShadow = createVShadowRoot(shadow)

      expect(typeof vShadow.id).toBe('string')
      expect(vShadow.id.length).toBeGreaterThan(0)
    })
  })

  describe('createVNode dispatches ShadowRoot', () => {
    it('returns VShadowRoot for ShadowRoot nodes', async () => {
      // We need createVNode from factory — it's already tested implicitly
      // but let's verify the instanceof dispatch
      const { createVNode } = await import('./factory')

      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })

      const vNode = createVNode(shadow)
      expect(vNode).not.toBeNull()

      vNode!.apply(n => {
        expect(n.type).toBe(NodeType.ShadowRoot)
      })
    })
  })

  describe('adoptedStyleSheets are captured', () => {
    it('captures adoptedStyleSheets rules in VShadowRoot', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })

      // jsdom supports adoptedStyleSheets as an array of CSSStyleSheet.
      // Use insertRule which jsdom supports to populate a sheet.
      const style = document.createElement('style')
      document.head.appendChild(style)
      const sheet = style.sheet!
      sheet.insertRule('div { color: red; }', 0)
      shadow.adoptedStyleSheets = [sheet]

      const vShadow = createVShadowRoot(shadow)

      expect(vShadow.adoptedStyleSheets.length).toBe(1)
      expect(vShadow.adoptedStyleSheets[0]).toContain('div')
      expect(vShadow.adoptedStyleSheets[0]).toContain('color')
      expect(vShadow.adoptedStyleSheets[0]).toContain('red')

      document.head.removeChild(style)
    })

    it('handles empty adoptedStyleSheets gracefully', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })

      const vShadow = createVShadowRoot(shadow)

      expect(vShadow.adoptedStyleSheets).toEqual([])
    })
  })

  describe('<style> elements in shadow roots', () => {
    it('captures style elements inside shadow roots', () => {
      const options = createRecordingOptions()
      const walkDOMTree = createDOMTreeWalker(options)
      const visitor = createDOMVisitor(options)
      walkDOMTree.acceptDOMVisitor(visitor)

      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const style = document.createElement('style')
      style.textContent = 'p { color: blue; }'
      shadow.appendChild(style)
      document.body.appendChild(host)

      const vtree = walkDOMTree(document)
      expect(vtree).not.toBeNull()

      const nodes = Object.values(vtree!.nodes)
      const styleNodes = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((n: any) => n && n.tagName === 'style')

      // The <style> element node should be present — its CSS rules are
      // captured via createStyleSheetVTree (cssRules), or as a plain element
      // when the sheet is unavailable. The text content child nodes of style
      // elements are intentionally skipped by the walker (local stylesheet
      // optimization).
      expect(styleNodes.length).toBeGreaterThanOrEqual(1)

      document.body.removeChild(host)
    })
  })

  describe('processMutationRecords discovers shadow roots in added nodes', () => {
    it('does not emit duplicate AddShadowRoot when element with shadow root is added', () => {
      const options = createRecordingOptions()
      const walkDOMTree = createDOMTreeWalker(options)
      walkDOMTree.acceptDOMVisitor(createDOMVisitor(options))

      const parent = document.createElement('div')
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const shadowChild = document.createElement('span')
      shadowChild.textContent = 'dynamic shadow'
      shadow.appendChild(shadowChild)

      const patches: Array<DOMPatch> = []
      let discoveredShadows: Array<ShadowRoot> = []

      const records: Array<MutationRecord> = [
        {
          type: 'childList',
          attributeName: null,
          attributeNamespace: null,
          oldValue: null,
          addedNodes: MockNodeList.from([host]),
          removedNodes: MockNodeList.from([]),
          target: parent,
          nextSibling: null,
          previousSibling: null,
        },
      ]

      internal__processMutationRecords(
        records,
        walkDOMTree,
        options,
        patch => patches.push(patch),
        shadow => discoveredShadows.push(shadow)
      )

      // Shadow content is already captured by walkDOMTree(addedNode) —
      // no separate AddShadowRoot patch should be emitted.
      const addShadowPatches = patches
        .map(p => {
          let val: any = null
          ;(p as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((p: any) => p && p.type === PatchType.AddShadowRoot)

      expect(addShadowPatches.length).toBe(0)

      // The shadow discovered callback should still be called
      // to set up MutationObserver on the shadow root.
      expect(discoveredShadows.length).toBe(1)
      expect(discoveredShadows[0]).toBe(shadow)

      // The AddNodes patch from walkDOMTree(host) should contain
      // the shadow root nodes.
      const addNodesPatches = patches
        .map(p => {
          let val: any = null
          ;(p as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((p: any) => p && p.type === PatchType.AddNodes)

      expect(addNodesPatches.length).toBeGreaterThan(0)
      const hostVTree = addNodesPatches[0].nodes[0]
      const hasShadowNode = Object.values(hostVTree.nodes).some((n: any) => {
        let val: any = null
        n.apply?.((v: any) => {
          val = v
        })
        return val && val.type === NodeType.ShadowRoot
      })
      expect(hasShadowNode).toBe(true)
    })

    it('does not emit addShadowRoot for closed shadow roots', () => {
      const options = createRecordingOptions()
      const walkDOMTree = createDOMTreeWalker(options)
      walkDOMTree.acceptDOMVisitor(createDOMVisitor(options))

      const parent = document.createElement('div')
      const host = document.createElement('div')
      host.attachShadow({ mode: 'closed' })

      const patches: Array<DOMPatch> = []
      let discoveredShadows: Array<ShadowRoot> = []

      const records: Array<MutationRecord> = [
        {
          type: 'childList',
          attributeName: null,
          attributeNamespace: null,
          oldValue: null,
          addedNodes: MockNodeList.from([host]),
          removedNodes: MockNodeList.from([]),
          target: parent,
          nextSibling: null,
          previousSibling: null,
        },
      ]

      internal__processMutationRecords(
        records,
        walkDOMTree,
        options,
        patch => patches.push(patch),
        shadow => discoveredShadows.push(shadow)
      )

      const addShadowPatches = patches
        .map(p => {
          let val: any = null
          ;(p as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((p: any) => p && p.type === PatchType.AddShadowRoot)

      expect(addShadowPatches.length).toBe(0)
      expect(discoveredShadows.length).toBe(0)
    })
  })

  describe('slot assignments', () => {
    it('captures slot assignedNodes', () => {
      const options = createRecordingOptions()
      const walkDOMTree = createDOMTreeWalker(options)
      const visitor = createDOMVisitor(options)
      walkDOMTree.acceptDOMVisitor(visitor)

      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const slot = document.createElement('slot')
      shadow.appendChild(slot)

      // Light DOM children that will be assigned to the default slot
      const lightChild1 = document.createElement('span')
      lightChild1.textContent = 'light one'
      const lightChild2 = document.createElement('span')
      lightChild2.textContent = 'light two'
      host.appendChild(lightChild1)
      host.appendChild(lightChild2)

      document.body.appendChild(host)

      // Need to assign node IDs to light children before calling getNodeId
      // so the factory can resolve them during the walk.
      // getNodeId is idempotent — calling it now ensures IDs exist.
      const lightChild1Id = getNodeId(lightChild1)
      const lightChild2Id = getNodeId(lightChild2)

      const vtree = walkDOMTree(document)
      expect(vtree).not.toBeNull()

      const nodes = Object.values(vtree!.nodes)
      const slotNodes = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter(
          (n: any) => n && n.type === NodeType.Element && n.tagName === 'slot'
        )

      expect(slotNodes.length).toBe(1)
      const slotVNode = slotNodes[0]

      // The slot should have assigned nodes matching the light DOM children
      expect(Array.isArray(slotVNode.slotAssignments)).toBe(true)
      expect(slotVNode.slotAssignments.length).toBe(2)
      expect(slotVNode.slotAssignments).toContain(lightChild1Id)
      expect(slotVNode.slotAssignments).toContain(lightChild2Id)

      document.body.removeChild(host)
    })

    it('non-slot elements have null slotAssignments', () => {
      const options = createRecordingOptions()
      const walkDOMTree = createDOMTreeWalker(options)
      const visitor = createDOMVisitor(options)
      walkDOMTree.acceptDOMVisitor(visitor)

      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const paragraph = document.createElement('p')
      paragraph.textContent = 'not a slot'
      shadow.appendChild(paragraph)
      document.body.appendChild(host)

      const vtree = walkDOMTree(document)
      expect(vtree).not.toBeNull()

      const nodes = Object.values(vtree!.nodes)
      const nonSlotElements = nodes
        .map(n => {
          let val: any = null
          ;(n as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter(
          (n: any) => n && n.type === NodeType.Element && n.tagName !== 'slot'
        )

      // Every non-slot element should have null slotAssignments
      expect(nonSlotElements.length).toBeGreaterThan(0)
      for (const el of nonSlotElements) {
        expect(el.slotAssignments).toBeNull()
      }

      document.body.removeChild(host)
    })
  })

  describe('attachShadow monkey-patch', () => {
    it('intercepts open mode', () => {
      const options = createRecordingOptions()
      const walker = createDOMTreeWalker(options)
      walker.acceptDOMVisitor(createDOMVisitor(options))

      const patches: Array<DOMPatch> = []
      const observer = createDOMObserver(walker, options, patch =>
        patches.push(patch)
      )

      // Get an initial VTree to satisfy the ObserverLike contract.
      const initialVTree = walker(document)
      observer.observe(document, initialVTree!)

      // Create an element with an open shadow root.
      const host = document.createElement('div')
      document.body.appendChild(host)
      const shadow = host.attachShadow({ mode: 'open' })
      const shadowChild = document.createElement('p')
      shadowChild.textContent = 'dynamic shadow'
      shadow.appendChild(shadowChild)

      // Should emit an addShadowRoot patch for the open shadow root.
      const addShadowPatches = patches
        .map(p => {
          let val: any = null
          ;(p as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((p: any) => p && p.type === PatchType.AddShadowRoot)

      expect(addShadowPatches.length).toBe(1)
      expect(addShadowPatches[0].hostId).toBe(getNodeId(host))
      expect(addShadowPatches[0].shadowRoot).toBeTruthy()

      observer.disconnect()
      document.body.removeChild(host)
    })

    it('ignores closed mode', () => {
      const options = createRecordingOptions()
      const walker = createDOMTreeWalker(options)
      walker.acceptDOMVisitor(createDOMVisitor(options))

      const patches: Array<DOMPatch> = []
      const observer = createDOMObserver(walker, options, patch =>
        patches.push(patch)
      )

      const initialVTree = walker(document)
      observer.observe(document, initialVTree!)

      const host = document.createElement('div')
      document.body.appendChild(host)
      host.attachShadow({ mode: 'closed' })

      // No addShadowRoot patch should be emitted for closed mode.
      const addShadowPatches = patches
        .map(p => {
          let val: any = null
          ;(p as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((p: any) => p && p.type === PatchType.AddShadowRoot)

      expect(addShadowPatches.length).toBe(0)

      observer.disconnect()
      document.body.removeChild(host)
    })

    it('does not recurse when observe() is called twice', () => {
      const options = createRecordingOptions()
      const walker = createDOMTreeWalker(options)
      walker.acceptDOMVisitor(createDOMVisitor(options))

      const patches: Array<DOMPatch> = []
      const observer = createDOMObserver(walker, options, patch =>
        patches.push(patch)
      )

      const initialVTree = walker(document)

      // First observe — installs monkey-patch
      observer.observe(document, initialVTree!)

      // Second observe on same instance — should not overwrite origAttachShadow
      // and should log a warning, not throw
      observer.observe(document, initialVTree!)

      // Verify attachShadow still works and does not stack overflow
      const host = document.createElement('div')
      document.body.appendChild(host)

      expect(() => {
        host.attachShadow({ mode: 'open' })
      }).not.toThrow()

      // Should still emit an addShadowRoot patch
      const addShadowPatches = patches
        .map(p => {
          let val: any = null
          ;(p as any).apply?.((v: any) => {
            val = v
          })
          return val
        })
        .filter((p: any) => p && p.type === PatchType.AddShadowRoot)

      expect(addShadowPatches.length).toBe(1)

      observer.disconnect()
      document.body.removeChild(host)
    })

    it('restores original attachShadow on disconnect', () => {
      const original = Element.prototype.attachShadow

      const options = createRecordingOptions()
      const walker = createDOMTreeWalker(options)
      walker.acceptDOMVisitor(createDOMVisitor(options))

      const observer = createDOMObserver(walker, options, () => {})

      const initialVTree = walker(document)
      observer.observe(document, initialVTree!)

      // Should be patched
      expect(Element.prototype.attachShadow).not.toBe(original)

      observer.disconnect()

      // Should be restored
      expect(Element.prototype.attachShadow).toBe(original)
    })
  })

  describe('isIgnoredByNode shadow containment', () => {
    it('excludes ShadowRoot in ignoredNodes', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const shadowChild = document.createElement('p')
      shadow.appendChild(shadowChild)
      document.body.appendChild(host)

      // Add the shadow root itself to ignoredNodes.
      expect(isIgnoredByNode(shadowChild, [shadow])).toBe(true)

      document.body.removeChild(host)
    })

    it('excludes shadow content when host is ignored', () => {
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const shadowChild = document.createElement('p')
      shadow.appendChild(shadowChild)
      document.body.appendChild(host)

      // Add the host to ignoredNodes — shadow content should be excluded
      // via cross-boundary containment.
      expect(isIgnoredByNode(shadowChild, [host])).toBe(true)

      document.body.removeChild(host)
    })
  })

  describe('walkDOMOnly', () => {
    it('produces correct VTree without firing passive visitors', () => {
      const options = createRecordingOptions()
      const walkDOMTree = createDOMTreeWalker(options)
      const visitor = createDOMVisitor(options)
      walkDOMTree.acceptDOMVisitor(visitor)

      // Register a spy passive visitor that counts elementNode calls
      let spyCallCount = 0
      walkDOMTree.accept({
        elementNode() {
          spyCallCount++
        },
        textNode() {},
        shadowRootNode() {},
        documentNode() {},
        documentTypeNode() {},
        documentFragmentNode() {},
        done() {
          return null
        },
      })

      // Create a host with an open shadow root
      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'open' })
      const shadowChild = document.createElement('p')
      shadowChild.textContent = 'shadow content'
      shadow.appendChild(shadowChild)
      document.body.appendChild(host)

      // Call walkDOMOnly on the host element
      const vtree = walkDOMTree.walkDOMOnly(host)
      expect(vtree).not.toBeNull()

      // Verify VTree contains shadow root node with expected children
      const nodes = Object.values(vtree!.nodes)
      const shadowVNodes = nodes
        .map(n => unwrapBox<any>(n))
        .filter((n: any) => n && n.type === NodeType.ShadowRoot)

      expect(shadowVNodes.length).toBeGreaterThanOrEqual(1)
      expect(shadowVNodes[0]!.hostId).toBe(getNodeId(host))
      expect(shadowVNodes[0]!.mode).toBe('open')

      // Shadow child text should be present
      const textValues = nodes
        .map(n => unwrapBox<any>(n))
        .filter(
          (n: any) =>
            n && n.type === NodeType.Text && n.value === 'shadow content'
        )
      expect(textValues.length).toBe(1)

      // Spy passive visitor should NOT have been called
      expect(spyCallCount).toBe(0)

      document.body.removeChild(host)
    })

    it('throws when DOM visitor is missing', () => {
      const options = createRecordingOptions()
      const walkDOMTree = createDOMTreeWalker(options)
      // Intentionally NOT setting a DOM visitor

      expect(() => {
        walkDOMTree.walkDOMOnly(document.createElement('div'))
      }).toThrow('DOMTreeWalker: missing DOM visitor')
    })
  })

  describe('attachShadow monkey-patch with walkDOMOnly', () => {
    it('emits AddShadowRoot without firing passive visitors for shadow root walk', () => {
      const options = createRecordingOptions()
      const walker = createDOMTreeWalker(options)
      walker.acceptDOMVisitor(createDOMVisitor(options))

      const patches: Array<DOMPatch> = []
      const observer = createDOMObserver(walker, options, patch =>
        patches.push(patch)
      )

      // Register a spy passive visitor to detect unwanted side effects
      const spyElementNodes: Array<Element> = []
      walker.accept({
        elementNode(node: Element) {
          spyElementNodes.push(node)
        },
        textNode() {},
        shadowRootNode() {},
        documentNode() {},
        documentTypeNode() {},
        documentFragmentNode() {},
        done() {
          return null
        },
      })

      const initialVTree = walker(document)
      observer.observe(document, initialVTree!)

      const host = document.createElement('div')
      document.body.appendChild(host)

      // Record spy count after observer setup but before attachShadow.
      // preAttachCount captures elements from the initial document walk
      // only (mutation observer callbacks from appendChild are
      // microtask-scheduled and haven't fired yet).
      const preAttachCount = spyElementNodes.length

      // Trigger attachShadow — monkey-patch uses walkDOMOnly
      host.attachShadow({ mode: 'open' })
      // Intentionally NOT appending children to the shadow root here:
      // doing so would trigger a MutationObserver walk that includes
      // passive visitors, making the spy count check ambiguous.

      // Verify AddShadowRoot patch is still emitted (existing behavior preserved)
      const addShadowPatches = patches
        .map(p => unwrapBox<any>(p))
        .filter((p: any) => p && p.type === PatchType.AddShadowRoot)

      expect(addShadowPatches.length).toBe(1)
      expect(addShadowPatches[0]!.hostId).toBe(getNodeId(host))
      expect(addShadowPatches[0]!.shadowRoot).toBeTruthy()

      // Verify spy passive visitor was NOT called for shadow root nodes
      // (walkDOMOnly skips all passive visitors, so the spy should not have
      // seen any elements inside the shadow root).
      expect(spyElementNodes.length).toBe(preAttachCount)

      observer.disconnect()
      document.body.removeChild(host)
    })
  })
})
