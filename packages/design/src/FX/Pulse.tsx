import { InlineBlock, JsxstyleComponentStyleProps } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'

type Props = PropsWithChildren<JsxstyleComponentStyleProps>

const animation = {
  from: { opacity: 1, scale: 1.2 },
  to: { opacity: 0.5, scale: 0.8 },
}

export const Pulse: React.FC<Props> = React.memo(({ children, ...props }) => (
  <InlineBlock
    {...props}
    animationIterationCount="infinite"
    animationDuration="500ms"
    animationDirection="alternate"
    animation={animation}
    transformOrigin="center center"
  >
    {children}
  </InlineBlock>
))
