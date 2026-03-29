/**
 * Shared height constants for form controls (Button, Input, Select).
 * All three components use these values to ensure visual alignment
 * when placed side by side.
 */
export const formControlHeight = {
  small: 28,
  medium: 36,
  large: 44,
} as const

export type FormControlSize = keyof typeof formControlHeight
