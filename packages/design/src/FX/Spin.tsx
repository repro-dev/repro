/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */
import { InlineBlock, JsxstyleComponentStyleProps } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { duration } from '../tokens/motion'
import { lineHeight } from '../tokens/typography'

type Props = PropsWithChildren<JsxstyleComponentStyleProps>

const animation = {
  from: { transform: 'rotate(0deg)' },
  to: { transform: 'rotate(360deg)' },
}

/**
 * Wraps children in a continuous 360-degree rotation animation.
 *
 * Use with an icon (e.g. `LoaderIcon` from lucide-react) to indicate
 * a loading state. Accepts jsxstyle style props for additional styling.
 *
 * When the user prefers reduced motion, the rotation animation is disabled.
 */
export const Spin: React.FC<Props> = React.memo(({ children, ...props }) => {
  const isReducedMotion = useReducedMotion()

  return (
    <InlineBlock
      {...props}
      lineHeight={lineHeight.none}
      animationIterationCount={isReducedMotion ? undefined : 'infinite'}
      animationDuration={isReducedMotion ? undefined : duration[1000]}
      animation={isReducedMotion ? undefined : animation}
    >
      {children}
    </InlineBlock>
  )
})
