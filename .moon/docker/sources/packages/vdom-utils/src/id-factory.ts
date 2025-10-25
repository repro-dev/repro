import { SyntheticId, VNode, VTree } from '@repro/domain'
import { randomString } from '@repro/random-string'

// @deprecated: use createNodeId instead
export function createSyntheticId() {
  return createNodeId()
}

export function createNodeId() {
  return randomString(5)
}

function createNodeIdFactory() {
  const nodeIds = new WeakMap<Node, SyntheticId>()

  return {
    hasNodeId(node: Node) {
      return nodeIds.has(node)
    },

    getNodeId(node: Node) {
      if (nodeIds.has(node)) {
        return nodeIds.get(node) as string
      }

      const nodeId = createNodeId()

      nodeIds.set(node, nodeId)

      return nodeId
    },
  }
}

export const { getNodeId, hasNodeId } = createNodeIdFactory()

export function getNodeIds(nodes: NodeList) {
  const queue = Array.from(nodes)
  const nodeIds: Array<SyntheticId> = []

  let node: Node | undefined

  while ((node = queue.shift())) {
    if (hasNodeId(node)) {
      queue.push(...Array.from(node.childNodes))
      nodeIds.push(getNodeId(node))
    }
  }

  return nodeIds
}

export function getVNodeById(vtree: VTree, nodeId: SyntheticId): VNode | null {
  return vtree.nodes[nodeId] ?? null
}
