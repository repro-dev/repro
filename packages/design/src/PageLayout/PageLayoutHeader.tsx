import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'

export interface PageLayoutHeaderGradient {
  from: string
  to: string
}

export interface PageLayoutHeaderProps {
  /** Background gradient for header branding. Overrides `backgroundColor`. */
  gradient?: PageLayoutHeaderGradient
  /** Solid background color. Defaults to `color.bg.emphasis`. */
  backgroundColor?: string
  /** Header height. Defaults to 120. */
  height?: number | string
  children?: React.ReactNode
}

/**
 * Top bar region of a PageLayout.
 *
 * Renders a full-width header with configurable background styling.
 * Use the `gradient` prop to apply branding gradients (e.g. workspace blue,
 * admin slate) or `backgroundColor` for a solid fill.
 *
 * @example
 *   <PageLayout.Header gradient={{ from: colors.blue['900'], to: colors.blue['700'] }}>
 *     <Logo />
 *   </PageLayout.Header>
 */
export const PageLayoutHeader = forwardRef<HTMLDivElement, PageLayoutHeaderProps>(
  (
    {
      gradient,
      backgroundColor = color.bg.emphasis,
      height = 120,
      children,
    },
    ref
  ) => {
    const backgroundImage = gradient
      ? `linear-gradient(to bottom right, ${gradient.from}, ${gradient.to})`
      : undefined

    return (
      <Block
        padding={spacing['2xl']}
        height={height}
        backgroundColor={gradient ? undefined : backgroundColor}
        backgroundImage={backgroundImage}
        props={{ ref }}
      >
        {children}
      </Block>
    )
  }
)

PageLayoutHeader.displayName = 'PageLayoutHeader'
