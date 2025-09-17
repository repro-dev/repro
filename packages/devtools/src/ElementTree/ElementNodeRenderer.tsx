import { Block } from '@jsxstyle/react'
import { IfGate } from '@repro/auth'
import { ElementR } from '@repro/design'
import { NodeId, NodeType, VElement } from '@repro/domain'
import { isEmptyElementVNode, isParentVNode } from '@repro/vdom-utils'
import React, { useContext } from 'react'
import { BreakpointAction } from './BreakpointAction'
import { NodeRenderer } from './NodeRenderer'
import { Toggle } from './Toggle'
import { TreeRow } from './TreeRow'
import {
  VTreeContext,
  useNode,
  useNodeBreakpoint,
  useNodeVisibility,
} from './context'

interface Props {
  depth: number
  nodeId: NodeId
}

export const ElementNodeRenderer: React.FC<Props> = ({ nodeId, depth }) => {
  const vtree = useContext(VTreeContext)
  const node = useNode(nodeId)
  const { hasBreakpoint, onToggleBreakpoint } = useNodeBreakpoint(nodeId)
  const { isVisible, onToggleNodeVisibility } = useNodeVisibility(nodeId)

  if (!vtree || !node) {
    return null
  }

  const hasChildren = node
    .filter<VElement>(node => node.type === NodeType.Element)
    .match(node => node.children.length > 0)

  const isEmptyElement = isEmptyElementVNode(node)

  const rootNode = vtree.nodes[vtree.rootId]
  const isTopLevelNode =
    rootNode &&
    isParentVNode(rootNode) &&
    rootNode.match(rootNode => rootNode.children.includes(nodeId))

  return node
    .filter<VElement>(node => node.type === NodeType.Element)
    .map(node => {
      return (
        <Block key={nodeId} position="relative">
          <TreeRow nodeId={nodeId} depth={depth} tag="open">
            <IfGate gate="breakpoints">
              <BreakpointAction
                active={hasBreakpoint}
                onClick={onToggleBreakpoint}
              />
            </IfGate>

            {!isTopLevelNode && hasChildren && (
              <Toggle isOpen={isVisible} onClick={onToggleNodeVisibility} />
            )}

            <ElementR.Open node={node} />

            {!isEmptyElement && !isVisible && <ElementR.Close node={node} />}
          </TreeRow>

          {!isEmptyElement && isVisible && (
            <Block>
              {node.children.map(childId => (
                <NodeRenderer
                  key={childId}
                  nodeId={childId}
                  depth={depth + 1}
                />
              ))}
            </Block>
          )}

          {!isEmptyElement && isVisible && (
            <TreeRow nodeId={nodeId} depth={depth} tag="close">
              <ElementR.Close node={node} />
            </TreeRow>
          )}
        </Block>
      )
    })
    .orElse(null)
}
