import { Row } from '@jsxstyle/react'
import { color, colors } from '@repro/design'
import React from 'react'

interface ButtonProps {
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

export const Button: React.FC<ButtonProps & { children?: React.ReactNode }> = ({
  children,
  active,
  disabled,
  onClick,
}) => (
  <Row
    component="button"
    appearance="none"
    alignItems="center"
    justifyContent="center"
    paddingInline={8}
    height={32}
    color={
      disabled
        ? color.border.strong
        : active
        ? colors.pink['500']
        : color.primary
    }
    border="none"
    borderRadius={4}
    backgroundColor={active ? colors.pink['100'] : 'transparent'}
    hoverBackgroundColor={disabled || active ? null : color.infoTint}
    cursor="pointer"
    pointerEvents={disabled ? 'none' : 'auto'}
    props={{ disabled, onClick }}
  >
    {children}
  </Row>
)
