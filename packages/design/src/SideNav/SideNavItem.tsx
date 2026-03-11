import { Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight } from '../tokens/typography'

export interface SideNavItemProps {
  icon?: React.ComponentType<{ size?: number; color?: string }>
  label: string
  active?: boolean
  component?: React.ElementType
  props?: Record<string, unknown>
}

export const SideNavItem = forwardRef<HTMLElement, SideNavItemProps>(
  (
    {
      icon: Icon,
      label,
      active = false,
      component,
      props: componentProps,
    },
    ref
  ) => {
    const iconColor = active ? color.primary : color.text.secondary
    const resolvedComponent = component ?? 'button'
    const isButton = resolvedComponent === 'button'

    return (
      <Row
        component={resolvedComponent as 'button'}
        alignItems="center"
        gap={spacing.md}
        paddingH={spacing.md}
        paddingV={spacing.md}
        borderRadius={radius.md}
        border="none"
        backgroundColor={active ? color.primarySubtle : 'transparent'}
        color={active ? color.primary : color.text.default}
        fontSize={fontSize.sm}
        fontWeight={active ? fontWeight.semibold : fontWeight.normal}
        cursor="pointer"
        textDecoration="none"
        textAlign="left"
        width="100%"
        transition={transition.fast}
        hoverBackgroundColor={
          active ? color.primarySubtleHover : color.bg.hover
        }
        {...focusRing()}
        props={{
          ref: ref as React.Ref<HTMLButtonElement>,
          ...(isButton ? { type: 'button' } : {}),
          ...componentProps,
        }}
      >
        {Icon && <Icon size={16} color={iconColor} />}
        {label}
      </Row>
    )
  }
)

SideNavItem.displayName = 'SideNavItem'
