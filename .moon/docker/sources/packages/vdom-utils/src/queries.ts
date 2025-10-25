import { VElement, VTree } from '@repro/domain'
import { createVTreeWalker } from './createVTreeWalker'

export function findElementsByClassName(
  vtree: VTree,
  className: string
): Array<VElement> {
  const nodes: Array<VElement> = []
  const walkTree = createVTreeWalker()

  walkTree.accept({
    // Not implemented
    documentNode() {},
    docTypeNode() {},
    textNode() {},

    elementNode(node) {
      if (node.attributes['class'] != null) {
        const classList = node.attributes['class'].split(/\s+/)

        if (classList.includes(className)) {
          nodes.push(node)
        }
      }
    },
  })

  walkTree(vtree)

  return nodes
}

export function findElementById(vtree: VTree, id: string): VElement | null {
  let node: VElement | null = null
  const walkTree = createVTreeWalker()

  walkTree.accept({
    // Not implemented
    documentNode() {},
    docTypeNode() {},
    textNode() {},

    elementNode(needle, _, controlContext) {
      if (needle.attributes['id'] === id) {
        node = needle
        controlContext.exit = true
      }
    },
  })

  walkTree(vtree)

  return node
}
