import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import React, { PropsWithChildren } from 'react'

export const FullWidthViewport: React.FC<PropsWithChildren> = ({
  children,
}) => (
  <Block
    position="relative"
    width="100%"
    height="100%"
    background={colors.white}
  >
    {children}
  </Block>
)
