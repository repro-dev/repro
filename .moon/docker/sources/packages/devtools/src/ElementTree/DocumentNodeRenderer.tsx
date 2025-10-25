import { Block } from '@jsxstyle/react'
import { DocumentR } from '@repro/design'
import { NodeType, SyntheticId, VDocument } from '@repro/domain'
import React, { useContext } from 'react'
import { NodeRenderer } from './NodeRenderer'
import { Toggle } from './Toggle'
import { TreeRow } from './TreeRow'
import { VTreeContext, useNode, useNodeVisibility } from './context'

interface Props {
  nodeId: SyntheticId
  depth: number
}

export const DocumentNodeRenderer: React.FC<Props> = ({ nodeId, depth }) => {
  const vtree = useContext(VTreeContext)
  const node = useNode(nodeId)
  const { isVisible, onToggleNodeVisibility } = useNodeVisibility(nodeId)

  if (!vtree || !node) {
    return null
  }

  const isRootNode = nodeId === vtree.rootId

  const childNodes = node
    .filter<VDocument>(node => node.type === NodeType.Document)
    .map(node => node.children)
    .orElse<Array<string>>([])

  const children = isVisible && (
    <Block>
      {childNodes.map(childId => (
        <NodeRenderer
          key={childId}
          nodeId={childId}
          depth={isRootNode ? depth : depth + 1}
        />
      ))}
    </Block>
  )

  if (nodeId === vtree.rootId) {
    return <React.Fragment>{children}</React.Fragment>
  }

  return (
    <Block key={nodeId}>
      <TreeRow nodeId={nodeId} depth={depth}>
        {childNodes.length && (
          <Toggle isOpen={isVisible} onClick={onToggleNodeVisibility} />
        )}
        <DocumentR />
      </TreeRow>
      {children}
    </Block>
  )
}
