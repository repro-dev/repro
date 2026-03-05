import { Inline } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'

export interface LinkProps {
  children?: React.ReactNode
  href?: string
  target?: React.HTMLAttributeAnchorTarget
  rel?: string
  disabled?: boolean
  component?: React.ElementType
  props?: Record<string, unknown>
}

/**
 * Semantic inline link that renders an `<a>` element by default. Supports
 * polymorphic rendering via the `component` prop so consumers can substitute
 * a router link (e.g. react-router `Link` or `NavLink`) without adding a
 * router dependency to this package.
 */
export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  (
    {
      children,
      href,
      target,
      rel,
      disabled = false,
      component,
      props: componentProps,
    },
    ref
  ) => {
    const resolvedRel =
      rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)

    const resolvedComponent = (component ?? 'a') as 'a'

    return (
      <Inline
        component={resolvedComponent}
        color={disabled ? color.text.muted : color.primary}
        hoverColor={disabled ? undefined : color.primaryHover}
        textDecoration="none"
        hoverTextDecoration={disabled ? undefined : 'underline'}
        cursor={disabled ? 'default' : 'pointer'}
        pointerEvents={disabled ? 'none' : undefined}
        transition={transition.fast}
        {...focusRing()}
        props={{
          ref,
          href: disabled ? undefined : href,
          target,
          rel: resolvedRel,
          'aria-disabled': disabled ? true : undefined,
          ...componentProps,
        }}
      >
        {children}
      </Inline>
    )
  }
)

Link.displayName = 'Link'
