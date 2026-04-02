import { Block } from '@jsxstyle/react'
import { ReactComponentNode } from '@repro/domain'
import React, { useState } from 'react'
import { ComponentTreeRow } from './ComponentTreeRow'

interface Props {
  nodes: Map<number, ReactComponentNode>
  selectedFiberId: number | null
  onSelect: (fiberId: number) => void
}

// Build adjacency list: parentFiberId -> children fiberNodeIds
function buildChildrenMap(
  nodes: Map<number, ReactComponentNode>
): Map<number, number[]> {
  const children = new Map<number, number[]>()
  for (const node of nodes.values()) {
    const parent = node.parentFiberId
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent)!.push(node.fiberNodeId)
  }
  return children
}

export const ComponentTree: React.FC<Props> = ({
  nodes,
  selectedFiberId,
  onSelect,
}) => {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const childrenMap = buildChildrenMap(nodes)

  // Roots are nodes whose parentFiberId is 0 or whose parent is not in the map
  const roots = Array.from(nodes.values()).filter(
    n => n.parentFiberId === 0 || !nodes.has(n.parentFiberId)
  )

  function toggleCollapse(fiberId: number) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(fiberId)) {
        next.delete(fiberId)
      } else {
        next.add(fiberId)
      }
      return next
    })
  }

  function renderNode(fiberId: number, depth: number): React.ReactNode {
    const node = nodes.get(fiberId)
    if (!node) return null

    const children = childrenMap.get(fiberId) ?? []
    const hasChildren = children.length > 0
    const isCollapsed = collapsed.has(fiberId)
    const isSelected = selectedFiberId === fiberId

    return (
      <React.Fragment key={fiberId}>
        <ComponentTreeRow
          node={node}
          depth={depth}
          hasChildren={hasChildren}
          isCollapsed={isCollapsed}
          isSelected={isSelected}
          onSelect={() => onSelect(fiberId)}
          onToggleCollapse={() => toggleCollapse(fiberId)}
        />
        {!isCollapsed &&
          children.map(childId => renderNode(childId, depth + 1))}
      </React.Fragment>
    )
  }

  return <Block>{roots.map(root => renderNode(root.fiberNodeId, 0))}</Block>
}
