import { Block } from '@jsxstyle/react'
import React from 'react'
import { color, duration, easing, radius, spacing } from '../tokens'

export interface RefreshProgressBarProps {
  show: boolean
  complete: boolean
  ariaLabel: string
}

const refreshProgressAnimation = {
  '0%': { transform: 'scaleX(0.35)' },
  '100%': { transform: 'scaleX(0.82)' },
}

/**
 * Refresh-progress bar extracted from the byte-identical implementations
 * in AccountsRoute and RecordingsRoute.
 *
 * Renders an absolute-positioned progress bar at the top of a
 * `position: relative` container (the Table's `bleed` wrapper).
 * Returns `null` when `show` is false.
 *
 * Token-driven — uses design tokens for all colors, spacing, and motion.
 */
export function RefreshProgressBar({
  show,
  complete,
  ariaLabel,
}: RefreshProgressBarProps) {
  if (!show) return null

  return (
    <Block
      position="absolute"
      top={0}
      left={0}
      right={0}
      height={spacing.xs}
      backgroundColor={color.border.default}
      zIndex={1}
      props={{
        role: 'progressbar',
        'aria-label': ariaLabel,
        'aria-valuenow': complete ? 100 : 80,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
      }}
    >
      <Block
        width="100%"
        height="100%"
        background={`linear-gradient(90deg, ${color.primary}, ${color.info})`}
        borderRadius={radius.full}
        transform={complete ? 'scaleX(1)' : 'scaleX(0.35)'}
        transformOrigin="left center"
        transition={`transform ${duration[200]} ${easing.easeOut}`}
        animation={complete ? undefined : refreshProgressAnimation}
        animationDuration={duration[1000]}
        animationFillMode="forwards"
        animationTimingFunction={easing.easeOut}
      />
    </Block>
  )
}
