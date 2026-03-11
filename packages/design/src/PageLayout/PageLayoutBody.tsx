import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'

export interface PageLayoutBodyProps {
  maxWidth?: number | string
  padding?: number | string
  children?: React.ReactNode
}

export const PageLayoutBody = forwardRef<HTMLDivElement, PageLayoutBodyProps>(
  ({ maxWidth, padding = spacing.xl, children }, ref) => {
    return (
      <Block position="relative" zIndex={1} padding={padding} props={{ ref }}>
        <Block
          maxWidth={maxWidth}
          margin={maxWidth ? '0 auto' : undefined}
          width="100%"
        >
          {children}
        </Block>
      </Block>
    )
  }
)

PageLayoutBody.displayName = 'PageLayoutBody'
