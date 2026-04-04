import { Block, Inline, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { ReactComponentNode } from '@repro/domain'
import { ChevronDown, ChevronRight } from 'lucide-react'
import React from 'react'
import { TreeRowBase } from '../ElementTree'

interface Props {
  node: ReactComponentNode
  depth: number
  hasChildren: boolean
  isCollapsed: boolean
  isSelected: boolean
  onSelect: () => void
  onToggleCollapse: () => void
}

export const ComponentTreeRow: React.FC<Props> = ({
  node,
  depth,
  hasChildren,
  isCollapsed,
  isSelected,
  onSelect,
  onToggleCollapse,
}) => {
  return (
    <TreeRowBase depth={depth} isSelected={isSelected} onClick={onSelect}>
      <Row alignItems="center" paddingV={2}>
        <Block
          width={14}
          flexShrink={0}
          color={colors.slate['400']}
          props={{
            onClick: (e: React.MouseEvent) => {
              if (hasChildren) {
                e.stopPropagation()
                onToggleCollapse()
              }
            },
          }}
        >
          {hasChildren &&
            (isCollapsed ? (
              <ChevronRight size={10} />
            ) : (
              <ChevronDown size={10} />
            ))}
        </Block>

        <Inline color={colors.violet['700']} fontWeight={500}>
          &lt;{node.componentName}&gt;
        </Inline>
      </Row>
    </TreeRowBase>
  )
}
