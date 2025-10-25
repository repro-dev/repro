import { Block, Inline } from '@jsxstyle/react'
import React from 'react'
import { colors } from '../theme'

const OpenIcon: React.FC = () => (
  <Inline color={colors.slate['700']}>{String.fromCharCode(0x25be)}</Inline>
)

const ClosedIcon: React.FC = () => (
  <Inline color={colors.slate['700']}>{String.fromCharCode(0x25b8)}</Inline>
)

export const Toggle: React.FC<{
  isOpen: boolean
  onClick: () => void
}> = ({ isOpen, onClick }) => (
  <Block
    height={16.25}
    fontSize={20}
    lineHeight={0}
    cursor="default"
    props={{ onClick }}
  >
    {isOpen ? <OpenIcon /> : <ClosedIcon />}
  </Block>
)
