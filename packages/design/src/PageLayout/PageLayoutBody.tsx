import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { spacing } from '../tokens/spacing'

export interface PageLayoutBodyProps {
  /** Maximum content width. Content is auto-centered when set. */
  maxWidth?: number | string
  /** Padding around the body content. Defaults to `spacing.xl` (16px). */
  padding?: number | string
  children?: React.ReactNode
}

/**
 * Main content region of a PageLayout.
 *
 * Renders a scrollable area that fills the remaining vertical space below
 * the header. Use `maxWidth` to constrain content width for single-column
 * layouts (the content auto-centers via `margin: '0 auto'`).
 *
 * @example
 *   <PageLayout.Body maxWidth={960}>
 *     <SettingsForm />
 *   </PageLayout.Body>
 */
export const PageLayoutBody = forwardRef<HTMLDivElement, PageLayoutBodyProps>(
  ({ maxWidth, padding = spacing.xl, children }, ref) => {
    return (
      <Block
        position="relative"
        zIndex={1}
        overflowY="auto"
        flex={1}
        padding={padding}
        props={{ ref }}
      >
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
