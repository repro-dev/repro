import { Inline } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'

export interface BreadcrumbsItemProps {
  children?: React.ReactNode
  component?: React.ElementType
  current?: boolean
  props?: Record<string, unknown>
}

/**
 * Individual breadcrumb item rendered as an `<li>`.
 *
 * When `current` is true the item renders as plain text with
 * `aria-current="page"`. Otherwise it renders using the `component` prop
 * (defaulting to `'span'`) so consumers can pass a router link. Pass
 * additional attributes (e.g. `href`, `to`) via the `props` bag.
 */
export const BreadcrumbsItem = forwardRef<HTMLLIElement, BreadcrumbsItemProps>(
  (
    { children, component, current = false, props: componentProps, ...rest },
    ref
  ) => {
    const showSeparator =
      (rest as { _showSeparator?: boolean })._showSeparator ?? false
    const Tag = (current ? 'span' : (component ?? 'span')) as 'span'
    const isInteractive = !current && component !== undefined

    return (
      <Inline
        component="li"
        display="flex"
        alignItems="center"
        gap={spacing.sm}
        props={{ ref }}
      >
        {showSeparator && (
          <Inline color={color.text.muted} props={{ 'aria-hidden': 'true' }}>
            /
          </Inline>
        )}
        {current ? (
          <Inline
            component="span"
            color={color.text.default}
            props={{ 'aria-current': 'page' }}
          >
            {children}
          </Inline>
        ) : (
          <Inline
            component={Tag}
            color={color.primary}
            textDecoration="none"
            transition={transition.fast}
            {...(isInteractive
              ? {
                  hoverColor: color.primaryHover,
                  hoverTextDecoration: 'underline',
                  cursor: 'pointer',
                  ...focusRing(),
                }
              : {})}
            props={componentProps}
          >
            {children}
          </Inline>
        )}
      </Inline>
    )
  }
)

BreadcrumbsItem.displayName = 'BreadcrumbsItem'
