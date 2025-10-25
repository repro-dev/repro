import { Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import React, { PropsWithChildren } from 'react'

interface ButtonProps {
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

export const Button: React.FC<PropsWithChildren<ButtonProps>> = ({
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
        ? colors.slate['300']
        : active
        ? colors.pink['500']
        : colors.blue['700']
    }
    border="none"
    borderRadius={4}
    backgroundColor={active ? colors.pink['100'] : 'transparent'}
    hoverBackgroundColor={disabled || active ? null : colors.blue['50']}
    cursor="pointer"
    pointerEvents={disabled ? 'none' : 'auto'}
    props={{ disabled, onClick }}
  >
    {children}
  </Row>
)
