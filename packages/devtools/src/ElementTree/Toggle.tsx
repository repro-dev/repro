import { Inline } from '@jsxstyle/react'
import { colors } from '@repro/design'
import React from 'react'
import { FONT_SIZE } from './constants'

const OpenIcon: React.FC = () => (
  <Inline fontSize={FONT_SIZE} color={colors.slate['700']}>
    {String.fromCharCode(0x25be)}
  </Inline>
)

const ClosedIcon: React.FC = () => (
  <Inline fontSize={FONT_SIZE} color={colors.slate['700']}>
    {String.fromCharCode(0x25b8)}
  </Inline>
)

export const Toggle: React.FC<{
  isOpen: boolean
  onClick: () => void
}> = ({ isOpen, onClick }) => (
  <Inline
    position="absolute"
    lineHeight={1.25}
    transform="translate(-150%, 0)"
    props={{ onClick }}
  >
    {isOpen ? <OpenIcon /> : <ClosedIcon />}
  </Inline>
)
