import React, { forwardRef, PropsWithChildren } from 'react'
import { Button as CatalystButton } from '~/catalyst/button'

export type ButtonProps = PropsWithChildren<{
  type?: 'button' | 'reset' | 'submit'
  size?: 'small' | 'medium' | 'large'
  variant?: 'contained' | 'outlined' | 'text'
  context?: 'info' | 'success' | 'warning' | 'danger' | 'neutral'
  rounded?: boolean
  disabled?: boolean
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
}>

const contextColorMap = {
  info: 'blue',
  success: 'green',
  warning: 'amber',
  danger: 'red',
  neutral: 'zinc',
} as const

const sizeClassMap = {
  small: 'px-2 py-1 text-xs',
  medium: '',
  large: 'px-5 py-3 text-base',
} as const

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      type = 'button',
      size = 'medium',
      variant = 'contained',
      context = 'info',
      rounded = true,
      disabled = false,
      onClick,
    },
    ref
  ) => {
    const sizeClass = sizeClassMap[size]
    const roundedClass = rounded ? '' : 'rounded-none'
    const className =
      [sizeClass, roundedClass].filter(Boolean).join(' ') || undefined

    if (variant === 'outlined') {
      return (
        <CatalystButton
          outline
          type={type}
          disabled={disabled}
          onClick={onClick}
          className={className}
          ref={ref}
        >
          {children}
        </CatalystButton>
      )
    }

    if (variant === 'text') {
      return (
        <CatalystButton
          plain
          type={type}
          disabled={disabled}
          onClick={onClick}
          className={className}
          ref={ref}
        >
          {children}
        </CatalystButton>
      )
    }

    return (
      <CatalystButton
        color={contextColorMap[context]}
        type={type}
        disabled={disabled}
        onClick={onClick}
        className={className}
        ref={ref}
      >
        {children}
      </CatalystButton>
    )
  }
)

Button.displayName = 'Button'
