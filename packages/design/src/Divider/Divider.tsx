import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  spacing?: 'none' | 'sm' | 'md' | 'lg'
}

const spacingMap = {
  none: spacing.none,
  sm: spacing.sm,
  md: spacing.md,
  lg: spacing.lg,
} as const

/**
 * Semantic separator for visually dividing content sections.
 *
 * Renders as an `<hr>` element with configurable orientation and spacing.
 * Use between content groups, in lists, or as a visual break in layouts.
 */
export const Divider = forwardRef<HTMLHRElement, DividerProps>(
  ({ orientation = 'horizontal', spacing: spacingProp = 'md' }, ref) => {
    const space = spacingMap[spacingProp]
    const isHorizontal = orientation === 'horizontal'

    return (
      <Block
        component="hr"
        backgroundColor={color.border.default}
        border="none"
        margin={0}
        padding={0}
        width={isHorizontal ? '100%' : 1}
        height={isHorizontal ? 1 : '100%'}
        alignSelf={isHorizontal ? undefined : 'stretch'}
        marginTop={isHorizontal ? space : undefined}
        marginBottom={isHorizontal ? space : undefined}
        marginLeft={isHorizontal ? undefined : space}
        marginRight={isHorizontal ? undefined : space}
        props={{
          ref,
          'aria-orientation': orientation,
        }}
      />
    )
  }
)

Divider.displayName = 'Divider'
