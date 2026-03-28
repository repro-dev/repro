import { NodeType, SyntheticId, VDocType } from '@repro/domain'
import React from 'react'
import { DocTypeR } from '../DOM'
import { TreeRow } from './TreeRow'
import { useNode } from './context'

interface Props {
  depth: number
  nodeId: SyntheticId
}

export const DocTypeNodeRenderer: React.FC<Props> = ({ nodeId, depth }) => {
  const node = useNode(nodeId)

  if (!node) {
    return null
  }

  return node
    .filter<VDocType>(node => node.type === NodeType.DocType)
    .map(node => (
      <TreeRow nodeId={nodeId} key={nodeId} depth={depth}>
        <DocTypeR node={node} />
      </TreeRow>
    ))
    .orElse(null)
}
