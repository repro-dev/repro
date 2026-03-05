import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { fontSize } from '../tokens/typography'

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  variant?: 'text' | 'rectangular' | 'circular'
  lines?: number
}

const pulseAnimation = {
  from: { opacity: 1 },
  to: { opacity: 0.5 },
}

const variantStyles = {
  text: {
    borderRadius: radius.sm,
    defaultWidth: '100%',
    defaultHeight: fontSize.sm,
  },
  rectangular: {
    borderRadius: radius.sm,
    defaultWidth: '100%',
    defaultHeight: 100,
  },
  circular: {
    borderRadius: radius.full,
    defaultWidth: 40,
    defaultHeight: 40,
  },
} as const

/**
 * Animated placeholder shape for loading states.
 *
 * Use to indicate that content is being fetched while preserving layout
 * structure. Supports text, rectangular, and circular variants.
 */
export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  ({ width, height, variant = 'text', lines = 1 }, ref) => {
    const styles = variantStyles[variant]
    const resolvedWidth = width ?? styles.defaultWidth
    const resolvedHeight = height ?? styles.defaultHeight

    if (variant === 'text' && lines > 1) {
      return (
        <Block
          display="flex"
          flexDirection="column"
          gap={spacing.sm}
          props={{
            ref,
            role: 'status',
            'aria-busy': true,
            'aria-label': 'Loading',
          }}
        >
          {Array.from({ length: lines }, (_, i) => (
            <Block
              key={i}
              width={i === lines - 1 ? '80%' : resolvedWidth}
              height={resolvedHeight}
              backgroundColor={color.border.default}
              borderRadius={styles.borderRadius}
              animation={pulseAnimation}
              animationDuration="1.5s"
              animationIterationCount="infinite"
              animationDirection="alternate"
            />
          ))}
        </Block>
      )
    }

    return (
      <Block
        width={resolvedWidth}
        height={resolvedHeight}
        backgroundColor={color.border.default}
        borderRadius={styles.borderRadius}
        animation={pulseAnimation}
        animationDuration="1.5s"
        animationIterationCount="infinite"
        animationDirection="alternate"
        props={{
          ref,
          role: 'status',
          'aria-busy': true,
          'aria-label': 'Loading',
        }}
      />
    )
  }
)

Skeleton.displayName = 'Skeleton'
