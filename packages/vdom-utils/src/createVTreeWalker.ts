import {
  NodeType,
  SyntheticId,
  VDocType,
  VDocument,
  VElement,
  VShadowRoot,
  VText,
  VTree,
} from '@repro/domain'

interface VTreeWalkerControlContext {
  exit: boolean
}

interface VNodeVisitor {
  documentNode(
    node: VDocument,
    vtree: VTree,
    controlContext: VTreeWalkerControlContext
  ): void
  docTypeNode(
    node: VDocType,
    vtree: VTree,
    controlContext: VTreeWalkerControlContext
  ): void
  elementNode(
    node: VElement,
    vtree: VTree,
    controlContext: VTreeWalkerControlContext
  ): void
  shadowRootNode(
    node: VShadowRoot,
    vtree: VTree,
    controlContext: VTreeWalkerControlContext
  ): void
  textNode(
    node: VText,
    vtree: VTree,
    controlContext: VTreeWalkerControlContext
  ): void
}

interface VTreeWalker {
  (vtree: VTree): void
  accept(visitor: VNodeVisitor): void
}

export function createVTreeWalker(): VTreeWalker {
  const visitors: Array<VNodeVisitor> = []

  function walkVTree(vtree: VTree) {
    const queue: Array<SyntheticId> = [vtree.rootId]

    let nodeId: SyntheticId | undefined

    const controlContext: VTreeWalkerControlContext = {
      exit: false,
    }

    controlLoop: while ((nodeId = queue.shift())) {
      const node = vtree.nodes[nodeId]

      if (!node) {
        continue
      }

      node.apply(node => {
        for (const visitor of visitors) {
          switch (node.type) {
            case NodeType.Document:
              visitor.documentNode(node, vtree, controlContext)
              break

            case NodeType.DocType:
              visitor.docTypeNode(node, vtree, controlContext)
              break

            case NodeType.Element:
              visitor.elementNode(node, vtree, controlContext)
              break

            case NodeType.ShadowRoot:
              visitor.shadowRootNode(node, vtree, controlContext)
              break

            case NodeType.Text:
              visitor.textNode(node, vtree, controlContext)
              break
          }
        }

        if ('children' in node) {
          queue.push(...node.children)
        }

        // If the node is a VElement that hosts a shadow root, walk
        // into the VShadowRoot linked via hostId.  VShadowRoot nodes are
        // not reachable through any parent's children array, so without
        // this step queries like findElementsByClassName would never
        // see shadow DOM content.
        if (node.type === NodeType.Element && node.shadowRoot) {
          const elementId = node.id
          for (const [, candidate] of Object.entries(vtree.nodes)) {
            candidate.apply(candidateNode => {
              if (
                candidateNode.type === NodeType.ShadowRoot &&
                candidateNode.hostId === elementId
              ) {
                for (const visitor of visitors) {
                  visitor.shadowRootNode(candidateNode, vtree, controlContext)
                }
                queue.push(...candidateNode.children)
              }
            })
          }
        }
      })

      if (controlContext.exit) {
        break controlLoop
      }
    }
  }

  walkVTree.accept = (visitor: VNodeVisitor) => {
    visitors.push(visitor)
  }

  return walkVTree
}
