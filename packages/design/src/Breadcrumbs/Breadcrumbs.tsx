import { Inline, Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

export interface BreadcrumbsProps {
  children?: React.ReactNode
  ariaLabel?: string
}

/**
 * Horizontal breadcrumb trail for page hierarchy navigation.
 *
 * Renders a `<nav>` with an `<ol>` list. Use `Breadcrumbs.Item` for each
 * breadcrumb level. Separators are inserted automatically between items.
 *
 * @example
 *   <Breadcrumbs>
 *     <Breadcrumbs.Item component="a" href="/">Home</Breadcrumbs.Item>
 *     <Breadcrumbs.Item component="a" href="/docs">Docs</Breadcrumbs.Item>
 *     <Breadcrumbs.Item current>Getting Started</Breadcrumbs.Item>
 *   </Breadcrumbs>
 */
export const Breadcrumbs = forwardRef<HTMLElement, BreadcrumbsProps>(
  ({ children, ariaLabel = 'Breadcrumb' }, ref) => {
    const items = React.Children.toArray(children)

    return (
      <Row component="nav" props={{ ref, 'aria-label': ariaLabel }}>
        <Row
          component="ol"
          alignItems="center"
          gap={spacing.sm}
          listStyle="none"
          margin={0}
          padding={0}
          {...textStyles.bodySmall}
        >
          {items.map((child, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <Inline
                  component="li"
                  color={color.text.muted}
                  props={{ 'aria-hidden': 'true' }}
                >
                  /
                </Inline>
              )}
              {child}
            </React.Fragment>
          ))}
        </Row>
      </Row>
    )
  }
)

Breadcrumbs.displayName = 'Breadcrumbs'
