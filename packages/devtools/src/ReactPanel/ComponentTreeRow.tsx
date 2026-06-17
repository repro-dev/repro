import { Block, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { ReactComponentNode } from '@repro/domain'
import { ChevronDown, ChevronRight } from 'lucide-react'
import React from 'react'
import { TreeRowBase } from '../ElementTree'
import { ComponentR } from './ComponentR'
/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing, @repro/oxlint-plugin-design/no-raw-palette */

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

        <ComponentR.Open node={node} />
      </Row>
    </TreeRowBase>
  )
}
/* eslint-enable */
