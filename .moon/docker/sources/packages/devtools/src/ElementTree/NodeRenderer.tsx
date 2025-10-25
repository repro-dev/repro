import { NodeType, SyntheticId } from '@repro/domain'
import React, { useContext } from 'react'
import { DocTypeNodeRenderer } from './DocTypeNodeRenderer'
import { DocumentNodeRenderer } from './DocumentNodeRenderer'
import { ElementNodeRenderer } from './ElementNodeRenderer'
import { TextNodeRenderer } from './TextNodeRenderer'
import { VTreeContext } from './context'

interface Props {
  depth: number
  nodeId: SyntheticId
}

export const NodeRenderer: React.FC<Props> = ({ depth, nodeId }) => {
  const vtree = useContext(VTreeContext)
  const node = vtree ? vtree.nodes[nodeId] : null

  if (!node) {
    return null
  }

  return node
    .map(node => {
      switch (node.type) {
        case NodeType.Document:
          return <DocumentNodeRenderer nodeId={nodeId} depth={depth} />

        case NodeType.DocType:
          return <DocTypeNodeRenderer nodeId={nodeId} depth={depth} />

        case NodeType.Element:
          return <ElementNodeRenderer nodeId={nodeId} depth={depth} />

        case NodeType.Text:
          return <TextNodeRenderer nodeId={nodeId} depth={depth} />
      }
    })
    .orElse(null)
}
