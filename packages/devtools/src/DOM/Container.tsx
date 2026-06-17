import { Inline } from '@jsxstyle/react'
import { fontSize, lineHeight } from '@repro/design'
import React, { PropsWithChildren } from 'react'

export const Container: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline
    fontSize={fontSize.xs}
    fontFamily="monospace"
    lineHeight={lineHeight.relaxed}
  >
    {children}
  </Inline>
)
