// Baseline Button component — the Apply target for the REP-1628 eval fixture.
//
// This mirrors the `@repro/design` Button prop surface (context / size /
// children) that the closed override vocabulary in scripts/pen-contract.ts
// translates pen overrides into. The eval scenario patches THIS component
// from the deltas detected in test.pen — it never regenerates it.
import type { ReactNode } from 'react'

export type ButtonContext =
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
export type ButtonSize = 'small' | 'medium' | 'large'
export type ButtonVariant = 'contained' | 'outlined' | 'text'

export interface ButtonProps {
  context?: ButtonContext
  size?: ButtonSize
  variant?: ButtonVariant
  disabled?: boolean
  children?: ReactNode
}

export function Button({
  context = 'info',
  size = 'medium',
  variant = 'contained',
  disabled = false,
  children,
}: ButtonProps) {
  return (
    <button
      data-context={context}
      data-size={size}
      data-variant={variant}
      disabled={disabled}
    >
      {children ?? 'Button'}
    </button>
  )
}
