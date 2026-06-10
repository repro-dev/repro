import {
  isExternalResource,
  isExternalStyleSheet,
  isIFrameElement,
  isLocalStylesheet,
} from '@repro/dom-utils'
import { SyntheticId, VNode, VTree } from '@repro/domain'
import { Box } from '@repro/tdl'
import {
  addVNode,
  createVTreeWithRoot,
  getNodeId,
  insertSubTreesAtNode,
  isElementVNode,
} from '@repro/vdom-utils'
import { DOMOptions, Subscribable, Subscriber, Visitor } from '../types'
import {
  createStyleSheetVTree,
  createVDocType,
  createVDocument,
  createVElement,
  createVShadowRoot,
  createVText,
} from './factory'

export function createDOMVisitor(
  options: Pick<DOMOptions, 'maskedSelectors'> = { maskedSelectors: [] }
) {
  let vtree: VTree | null = null

  function createOrUpdateVTree(node: VNode, parentId: SyntheticId | null) {
    if (!vtree) {
      vtree = createVTreeWithRoot(node)
      return
    }

    if (!parentId) {
      throw new Error('VDOM: cannot add node to tree; missing parentId')
    }

    if (!vtree.nodes[parentId]) {
      throw new Error(
        `VDOM: cannot add node to tree; parent node "${parentId}" not found in VTree`
      )
    }

    addVNode(vtree, node, parentId)
  }

  const subscribers: Array<Subscriber<VTree>> = []

  function publish(vtree: VTree) {
    for (const subscriber of subscribers) {
      subscriber(vtree)
    }
  }

  const domVisitor: Visitor<VTree> & Subscribable<VTree> = {
    documentNode(node) {
      const vNode = new Box(createVDocument(node))
      const parent = node.defaultView ? node.defaultView.frameElement : null

      createOrUpdateVTree(vNode, parent && getNodeId(parent))
    },

    documentTypeNode(node) {
      const vNode = new Box(createVDocType(node))
      createOrUpdateVTree(vNode, node.parentNode && getNodeId(node.parentNode))
    },

    documentFragmentNode(_node) {},

    shadowRootNode(node) {
      const vNode = new Box(createVShadowRoot(node))
      const hostId = getNodeId(node.host)

      if (!vtree) {
        vtree = createVTreeWithRoot(vNode)
        return
      }

      if (!vtree.nodes[hostId]) {
        throw new Error(
          `VDOM: cannot add shadow root to tree; host node "${hostId}" not found in VTree`
        )
      }

      // Add shadow root node directly to VTree.nodes — it is linked to the
      // host via hostId, not as a child of the host element.
      vNode.apply(node => {
        vtree!.nodes[node.id] = vNode
      })
    },

    elementNode(node) {
      if (isLocalStylesheet(node) || isExternalStyleSheet(node)) {
        let subtree: VTree | null = null

        try {
          subtree = createStyleSheetVTree(node)
        } catch {}

        if (subtree) {
          if (!vtree) {
            vtree = subtree
            return
          }

          if (node.parentNode) {
            const parentId = getNodeId(node.parentNode)
            const parentVNode = vtree.nodes[parentId]

            if (parentVNode && isElementVNode(parentVNode)) {
              parentVNode.apply(parentVNode => {
                insertSubTreesAtNode(
                  vtree as VTree,
                  parentVNode,
                  [subtree as VTree],
                  parentVNode.children.length
                )
              })

              return
            }
          }
        }
      }

      if (isExternalResource(node) && !isExternalStyleSheet(node)) {
        return
      }

      const vNode = new Box(
        createVElement(node, { maskedSelectors: options.maskedSelectors })
      )
      createOrUpdateVTree(vNode, node.parentNode && getNodeId(node.parentNode))
    },

    textNode(node) {
      const vNode = new Box(
        createVText(node, { maskedSelectors: options.maskedSelectors })
      )
      createOrUpdateVTree(vNode, node.parentNode && getNodeId(node.parentNode))
    },

    done() {
      const value = vtree

      if (value) {
        publish(value)
      }

      vtree = null
      return value
    },

    subscribe(subscriber) {
      subscribers.push(subscriber)
    },
  }

  return domVisitor
}

export function createIFrameVisitor() {
  let iframes: Array<Document> = []
  const subscribers: Array<Subscriber<Array<Document>>> = []

  function publish(value: Array<Document>) {
    for (const subscriber of subscribers) {
      subscriber(value)
    }
  }

  const iframeVisitor: Visitor<Array<Document>> &
    Subscribable<Array<Document>> = {
    elementNode(node) {
      if (isIFrameElement(node)) {
        const doc = node.contentDocument

        if (doc) {
          iframes.push(doc)
        }
      }
    },

    // Unimplemented
    documentNode() {},
    documentTypeNode() {},
    documentFragmentNode() {},
    shadowRootNode() {},
    textNode() {},

    done() {
      const value = iframes
      publish(value)
      iframes = []
      return value
    },

    subscribe(subscriber) {
      subscribers.push(subscriber)
    },
  }

  return iframeVisitor
}
