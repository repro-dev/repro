import { Block, Inline } from '@jsxstyle/react'
import { color } from '@repro/design'
import React from 'react'

const OpenIcon: React.FC = () => (
  <Inline color={color.text.secondary}>{String.fromCharCode(0x25be)}</Inline>
)

const ClosedIcon: React.FC = () => (
  <Inline color={color.text.secondary}>{String.fromCharCode(0x25b8)}</Inline>
)

export const Toggle: React.FC<{ isOpen: boolean; onClick: () => void }> = ({
  isOpen,
  onClick,
}) => (
  <Block
    height={13.75}
    fontSize={16}
    lineHeight={0}
    cursor="default"
    props={{ onClick }}
  >
    {isOpen ? <OpenIcon /> : <ClosedIcon />}
  </Block>
)
