import { Block, Inline, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { ReactComponentNode } from '@repro/domain'
import { ChevronDown, ChevronRight } from 'lucide-react'
import React from 'react'

const INDENT = 16
const FONT_SIZE = 11

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
    <Row
      alignItems="center"
      paddingLeft={INDENT * (depth + 1)}
      paddingV={2}
      backgroundColor={isSelected ? colors.blue['100'] : 'transparent'}
      hoverBackgroundColor={isSelected ? colors.blue['100'] : colors.blue['50']}
      fontSize={FONT_SIZE}
      cursor="default"
      userSelect="none"
      props={{ onClick: onSelect }}
    >
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
  )
}
