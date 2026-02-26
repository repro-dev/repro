import { InlineBlock, JsxstyleComponentStyleProps } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'

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
 */
export const Spin: React.FC<Props> = React.memo(({ children, ...props }) => (
  <InlineBlock
    {...props}
    lineHeight={0}
    animationIterationCount="infinite"
    animationDuration="1s"
    animation={animation}
  >
    {children}
  </InlineBlock>
))
