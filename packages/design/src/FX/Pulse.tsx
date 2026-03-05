import { InlineBlock, JsxstyleComponentStyleProps } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { duration } from '../tokens/motion'

type Props = PropsWithChildren<JsxstyleComponentStyleProps>

const animation = {
  from: { opacity: 1, scale: 1.2 },
  to: { opacity: 0.5, scale: 0.8 },
}

/**
 * Wraps children in an alternating pulse animation (opacity + scale).
 *
 * Use to draw attention to an element with a subtle breathing effect.
 * Accepts jsxstyle style props for additional styling.
 */
export const Pulse: React.FC<Props> = React.memo(({ children, ...props }) => (
  <InlineBlock
    {...props}
    animationIterationCount="infinite"
    animationDuration={duration[500]}
    animationDirection="alternate"
    animation={animation}
    transformOrigin="center center"
  >
    {children}
  </InlineBlock>
))
