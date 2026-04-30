import { Row } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { focusRing } from '../tokens/interaction'
import { spacing } from '../tokens/spacing'
import { fontSize } from '../tokens/typography'

export interface SideNavItemProps {
  icon?: React.ComponentType<{ size?: number | string; color?: string }>
  label: string
  active?: boolean
  disabled?: boolean
  component?: React.ElementType
  props?: Record<string, unknown>
}

export const SideNavItem = forwardRef<HTMLElement, SideNavItemProps>(
  (
    {
      icon: Icon,
      label,
      active = false,
      disabled = false,
      component,
      props: componentProps,
    },
    ref
  ) => {
    const resolvedComponent = component ?? 'button'
    const isButton = resolvedComponent === 'button'

    return (
      <Row
        component={resolvedComponent as 'button'}
        alignItems="center"
        gap={spacing.md}
        paddingH={spacing.lg}
        blockSize={spacing['3xl']}
        backgroundColor={active ? color.bg.muted : 'transparent'}
        borderInlineStartWidth={4}
        borderInlineStartStyle="solid"
        borderColor="transparent"
        borderInlineStartColor={active ? color.primary : 'transparent'}
        color={color.text.default}
        fontSize={fontSize.sm}
        cursor={disabled ? 'default' : 'pointer'}
        pointerEvents={disabled ? 'none' : undefined}
        opacity={disabled ? 0.5 : undefined}
        textDecoration="none"
        textAlign="left"
        width="100%"
        hoverBackgroundColor={
          disabled ? undefined : active ? color.bg.muted : color.bg.hover
        }
        {...focusRing()}
        props={{
          ref: ref as React.Ref<HTMLButtonElement>,
          ...(isButton ? { type: 'button' } : {}),
          ...(disabled ? { 'aria-disabled': 'true' } : {}),
          ...componentProps,
        }}
      >
        {Icon && <Icon size={16} color={color.text.secondary} />}
        {label}
      </Row>
    )
  }
)

SideNavItem.displayName = 'SideNavItem'
