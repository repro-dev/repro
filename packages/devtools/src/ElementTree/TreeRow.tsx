import { Block } from '@jsxstyle/react'
import { color } from '@repro/design'
import React, { PropsWithChildren } from 'react'
import { FONT_SIZE, INDENT } from './constants'
import { useNodeState } from './context'

// Generic tree row container — shared by ElementTree and ReactPanel.
// Handles indent, selection highlight, hover, font size, and click/hover callbacks.
export type TreeRowBaseProps = PropsWithChildren

export const TreeRowBase: React.FC = ({
  children,
  depth,
  isSelected,
  disableFocus,
  onClick,
  onPointerEnter,
}) => {
  return (
    <Block
      position="relative"
      paddingLeft={INDENT * (depth + 1)}
      backgroundColor={isSelected ? color.primarySubtle : 'transparent'}
      hoverBackgroundColor={
        isSelected
          ? color.primarySubtle
          : !disableFocus
          ? color.infoTint
          : undefined
      }
      fontSize={FONT_SIZE}
      cursor="default"
      wordBreak="break-word"
      userSelect="none"
      props={{
        onClick,
        ...(onPointerEnter ? { onPointerEnter } : {}),
      }}
    >
      {children}
    </Block>
  )
}

// Context-bound wrapper used by ElementTree — reads selection state from NodeStateContext.
type TreeRowProps = PropsWithChildren

export const TreeRow: React.FC = ({
  children,
  depth,
  nodeId,
  disableFocus,
  tag = 'open',
}) => {
  const { isSelected, onFocusNode, onSelectNode } = useNodeState(nodeId, tag)

  return (
    <div data-tree-node={`${nodeId}~${tag}`}>
      <TreeRowBase
        depth={depth}
        isSelected={isSelected}
        disableFocus={disableFocus}
        onClick={() => onSelectNode(tag)}
        onPointerEnter={() => onFocusNode(tag)}
      >
        {children}
      </TreeRowBase>
    </div>
  )
}
