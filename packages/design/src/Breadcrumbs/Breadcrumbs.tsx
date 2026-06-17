import { Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
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
 *     <Breadcrumbs.Item component="a" props={{ href: '/' }}>Home</Breadcrumbs.Item>
 *     <Breadcrumbs.Item component="a" props={{ href: '/docs' }}>Docs</Breadcrumbs.Item>
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
          margin={spacing.none}
          padding={spacing.none}
          {...textStyles.bodySmall}
        >
          {items.map((child, i) =>
            React.isValidElement(child)
              ? React.cloneElement(child, {
                  key: i,
                  _showSeparator: i > 0,
                } as Record<string, unknown>)
              : child
          )}
        </Row>
      </Row>
    )
  }
)

Breadcrumbs.displayName = 'Breadcrumbs'
