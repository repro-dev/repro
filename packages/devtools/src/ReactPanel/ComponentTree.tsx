import { Block, Row } from '@jsxstyle/react'
import { ReactComponentNode } from '@repro/domain'
import React, { useMemo, useState } from 'react'
import { TreeRowBase } from '../ElementTree'
import { ComponentR } from './ComponentR'
import { ComponentTreeRow } from './ComponentTreeRow'

interface Props {
  nodes: Map<number, ReactComponentNode>
  rootId: number | null
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
    // Skip nodes with no parent (roots)
    if (parent === null) continue
    if (!children.has(parent)) children.set(parent, [])
    children.get(parent)!.push(node.fiberNodeId)
  }
  return children
}

export const ComponentTree: React.FC<Props> = ({
  nodes,
  rootId,
  selectedFiberId,
  onSelect,
}) => {
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())

  const childrenMap = useMemo(() => buildChildrenMap(nodes), [nodes])

  // Use rootId when available; fall back to heuristic for incremental-only maps
  const roots = useMemo(() => {
    if (rootId !== null && nodes.has(rootId)) {
      return [nodes.get(rootId)!]
    }
    // Fallback: nodes whose parent is not in the map (or has no parent)
    return Array.from(nodes.values()).filter(
      n => n.parentFiberId === null || !nodes.has(n.parentFiberId)
    )
  }, [nodes, rootId])

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
    const isExpanded = hasChildren && !isCollapsed

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

        {isExpanded && children.map(childId => renderNode(childId, depth + 1))}

        {isExpanded && (
          <TreeRowBase
            depth={depth}
            isSelected={isSelected}
            onClick={() => onSelect(fiberId)}
          >
            <Row alignItems="center" paddingV={2}>
              <Block width={14} flexShrink={0} />
              <ComponentR.Close node={node} />
            </Row>
          </TreeRowBase>
        )}
      </React.Fragment>
    )
  }

  return <Block>{roots.map(root => renderNode(root.fiberNodeId, 0))}</Block>
}
