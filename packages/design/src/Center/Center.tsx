import { Grid } from '@jsxstyle/react'
import React, { forwardRef } from 'react'

export interface CenterProps {
  /** Optional max-width constraint for the centered content. */
  maxWidth?: number | string
  children?: React.ReactNode
}

/**
 * Centers its children both horizontally and vertically within available space.
 *
 * Renders a CSS Grid container with `align-items: center` and
 * `justify-content: center` that fills its parent by default. Use `Center`
 * instead of ad-hoc `Grid` centering patterns for consistent layout.
 *
 * The optional `maxWidth` prop constrains the container width without
 * affecting the centering behavior.
 *
 * @example
 *   <Center>
 *     <Spinner />
 *   </Center>
 *
 * @example
 *   <Center maxWidth={480}>
 *     <LoginForm />
 *   </Center>
 */
export const Center = forwardRef<HTMLDivElement, CenterProps>(
  ({ maxWidth, children }, ref) => {
    return (
      <Grid
        alignItems="center"
        justifyContent="center"
        height="100%"
        width="100%"
        maxWidth={maxWidth}
        margin={maxWidth ? '0 auto' : undefined}
        props={{ ref }}
      >
        {children}
      </Grid>
    )
  }
)

Center.displayName = 'Center'
