import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'

export interface PageLayoutHeaderProps {
  /** Optional solid background color. Transparent by default. */
  backgroundColor?: string
  children?: React.ReactNode
}

/**
 * Top bar region of a PageLayout.
 *
 * Renders a full-width header that is transparent by default. For branded
 * pages, pair with `PageLayout.Backdrop` to paint a gradient behind the
 * header. Use `backgroundColor` only when an opaque header is needed
 * without a backdrop.
 *
 * @example
 *   <PageLayout>
 *     <PageLayout.Backdrop gradient={{ from: colors.blue['900'], to: colors.blue['700'] }} />
 *     <PageLayout.Header>
 *       <Logo />
 *     </PageLayout.Header>
 *   </PageLayout>
 */
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
