import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'

export interface PageLayoutHeaderProps {
  backgroundColor?: string
  children?: React.ReactNode
}

export const PageLayoutHeader = forwardRef<
  HTMLDivElement,
  PageLayoutHeaderProps
>(({ backgroundColor, children }, ref) => {
  return (
    <Block
      position="relative"
      zIndex={1}
      paddingTop={spacing['2xl']}
      paddingLeft={spacing['2xl']}
      paddingRight={spacing['2xl']}
      paddingBottom={spacing.md}
      backgroundColor={backgroundColor}
      props={{ ref }}
    >
      {children}
    </Block>
  )
})

PageLayoutHeader.displayName = 'PageLayoutHeader'
