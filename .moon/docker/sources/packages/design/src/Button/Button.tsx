import { Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { colors } from '../theme'

type Props = PropsWithChildren<{
  type?: 'button' | 'reset' | 'submit'
  size?: 'small' | 'medium' | 'large'
  variant?: 'contained' | 'outlined' | 'text'
  context?: 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'inverted'
  rounded?: boolean
  disabled?: boolean
  onClick?: () => void
}>

const sizes = {
  small: 6,
  medium: 8,
  large: 10,
}

const colorGroups = {
  info: colors.blue,
  success: colors.green,
  warning: colors.amber,
  danger: colors.red,
  neutral: colors.slate,
  inverted: colors.white,
}

const MINIMUM_FONT_SIZE = 12

export const Button: React.FC<Props> = ({
  children,
  type = 'button',
  size = 'medium',
  variant = 'contained',
  context = 'info',
  rounded = true,
  disabled = false,
  onClick,
}) => {
  const base = sizes[size]
  const height = base * 5
  const paddingH = base * 2
  const fontSize = Math.max(base * 1.5, MINIMUM_FONT_SIZE)
  const gap = base
  const colorGroup = colorGroups[context]

  return (
    <Row
      position="relative"
      component="button"
      props={{ disabled, type, onClick }}
      gap={gap}
      height={height}
      paddingH={paddingH}
      alignItems="center"
      justifyContent="center"
      backgroundColor={
        variant === 'contained' ? colorGroup['700'] : 'transparent'
      }
      hoverBackgroundColor={
        disabled
          ? null
          : variant === 'contained'
          ? colorGroup['600']
          : colorGroup['50']
      }
      boxSizing="border-box"
      borderColor={variant === 'outlined' ? colorGroup['300'] : 'transparent'}
      borderStyle="solid"
      borderWidth={1}
      borderRadius={rounded ? base / 2 : 0}
      color={
        variant === 'contained'
          ? context === 'inverted'
            ? colors.slate['900']
            : colors.white
          : colorGroup['900']
      }
      boxShadow={
        disabled
          ? 'none'
          : variant === 'contained'
          ? '0 2px 4px rgba(0, 0, 0, 0.25)'
          : 'none'
      }
      opacity={disabled ? 0.5 : 1}
      cursor={disabled ? 'default' : 'pointer'}
      fontSize={fontSize}
      lineHeight="1em"
      outline="none"
      transition="all linear 100ms"
    >
      {children}
    </Row>
  )
}
