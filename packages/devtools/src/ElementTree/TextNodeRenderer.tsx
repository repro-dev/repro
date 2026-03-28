import { NodeType, SyntheticId, VText } from '@repro/domain'
import React from 'react'
import { TextR } from '../DOM'
import { TreeRow } from './TreeRow'
import { useNode } from './context'

interface Props {
  depth: number
  nodeId: SyntheticId
}

export const TextNodeRenderer: React.FC<Props> = ({ depth, nodeId }) => {
  const node = useNode(nodeId)

  if (!node) {
    return null
  }

  return node
    .filter<VText>(node => node.type === NodeType.Text)
    .map(node => {
      // TODO: only filter out empty text nodes between block-level elements
      if (/^\s*$/.test(node.value)) {
        return null
      }

      return (
        <TreeRow nodeId={nodeId} depth={depth}>
          <TextR node={node} />
        </TreeRow>
      )
    })
    .orElse(null)
}
