import { Inline } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'

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
  ({ children, component, current = false, props: componentProps }, ref) => {
    const Tag = (current ? 'span' : component ?? 'span') as 'span'

    return (
      <Inline component="li" props={{ ref }}>
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
            hoverColor={color.primaryHover}
            textDecoration="none"
            hoverTextDecoration="underline"
            cursor="pointer"
            transition={transition.fast}
            {...focusRing()}
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
