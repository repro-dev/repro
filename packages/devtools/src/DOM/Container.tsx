import { Inline } from '@jsxstyle/react'
import { lineHeight } from '@repro/design'
import React, { PropsWithChildren } from 'react'
import { FONT_SIZE } from './constants'

export const Container: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline
    fontSize={FONT_SIZE}
    fontFamily="monospace"
    lineHeight={lineHeight.relaxed}
  >
    {children}
  </Inline>
)
