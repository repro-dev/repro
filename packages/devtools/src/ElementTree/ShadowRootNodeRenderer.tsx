import { Block, Inline } from '@jsxstyle/react'
import { color } from '@repro/design'
import { NodeId } from '@repro/domain'
import React from 'react'
import { NodeRenderer } from './NodeRenderer'
import { FONT_SIZE, INDENT } from './constants'

interface Props {
  depth: number
  childIds: Array<NodeId>
}

export const ShadowRootNodeRenderer: React.FC<Props> = ({
  depth,
  childIds,
}) => {
  return (
    <Block>
      {/* Non-interactive #shadow-root (open) label row */}
      <Block
        paddingLeft={INDENT * (depth + 1)}
        fontSize={FONT_SIZE}
        userSelect="none"
        cursor="default"
      >
        <Inline color={color.neutral[500]}>{'#shadow-root (open)'}</Inline>
      </Block>

      {childIds.map(childId => (
        <NodeRenderer key={childId} nodeId={childId} depth={depth + 1} />
      ))}
    </Block>
  )
}
