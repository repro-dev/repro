import { Block, Inline } from '@jsxstyle/react'
import { color } from '@repro/design'
import { NodeType, SyntheticId, VShadowRoot } from '@repro/domain'
import React, { useContext } from 'react'
import { Container } from '../DOM/Container'
import { NodeRenderer } from './NodeRenderer'
import { Toggle } from './Toggle'
import { TreeRow } from './TreeRow'
import { VTreeContext, useNode, useNodeVisibility } from './context'

interface Props {
  nodeId: SyntheticId
  depth: number
}

export const ShadowRootNodeRenderer: React.FC<Props> = ({ nodeId, depth }) => {
  const vtree = useContext(VTreeContext)
  const node = useNode(nodeId)
  const { isVisible, onToggleNodeVisibility } = useNodeVisibility(nodeId)

  if (!vtree || !node) {
    return null
  }

  const childNodes = node
    .filter<VShadowRoot>(node => node.type === NodeType.ShadowRoot)
    .map(node => node.children)
    .orElse<Array<string>>([])

  return node
    .filter<VShadowRoot>(node => node.type === NodeType.ShadowRoot)
    .map(node => (
      <Block key={nodeId}>
        <TreeRow nodeId={nodeId} depth={depth}>
          {childNodes.length > 0 && (
            <Toggle isOpen={isVisible} onClick={onToggleNodeVisibility} />
          )}
          <Container>
            <Inline color={color.text.muted}>
              {`#shadow-root (${node.mode})`}
            </Inline>
          </Container>
        </TreeRow>
        {isVisible && (
          <Block>
            {childNodes.map(childId => (
              <NodeRenderer key={childId} nodeId={childId} depth={depth + 1} />
            ))}
          </Block>
        )}
      </Block>
    ))
    .orElse(null)
}
