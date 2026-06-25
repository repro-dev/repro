import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { duration } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { fontSize } from '../tokens/typography'

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  variant?: 'text' | 'rectangular' | 'circular'
  lines?: number
}

const SHIMMER_WIDTH = 1000

const shimmerGradient = `linear-gradient(90deg, ${color.border.default} 0px, ${
  color.bg.hover
} ${SHIMMER_WIDTH / 2}px, ${color.border.default} ${SHIMMER_WIDTH}px)`

const shimmerAnimation = {
  '0%': { backgroundPosition: `${SHIMMER_WIDTH}px 0` },
  '100%': { backgroundPosition: `${-SHIMMER_WIDTH}px 0` },
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
    const isReducedMotion = useReducedMotion()

    const shimmerProps = isReducedMotion
      ? {
          background: color.border.default,
        }
      : {
          background: shimmerGradient,
          backgroundSize: `${SHIMMER_WIDTH}px 100%`,
          animation: shimmerAnimation,
          animationDuration: duration[1800],
          animationIterationCount: 'infinite' as const,
          animationTimingFunction: 'linear',
        }

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
              borderRadius={styles.borderRadius}
              {...shimmerProps}
            />
          ))}
        </Block>
      )
    }

    return (
      <Block
        width={resolvedWidth}
        height={resolvedHeight}
        borderRadius={styles.borderRadius}
        {...shimmerProps}
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
