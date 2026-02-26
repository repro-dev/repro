import type React from 'react'

export type SizeVariant = 'small' | 'medium' | 'large'

export type ButtonVariant = 'contained' | 'outlined' | 'text'

export type ContextVariant =
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'

export type ButtonClickHandler = (
  event: React.MouseEvent<HTMLButtonElement>
) => void

export type InputChangeHandler = (
  event: React.ChangeEvent<HTMLInputElement>
) => void

export interface WithChildren {
  children?: React.ReactNode
}

export interface WithSize {
  size?: SizeVariant
}

export interface WithDisabled {
  disabled?: boolean
}

export interface WithRounded {
  rounded?: boolean
}
