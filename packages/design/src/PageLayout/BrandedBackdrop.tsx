import { Block } from '@jsxstyle/react'
import React, { forwardRef } from 'react'

export interface BrandedBackdropGradient {
  from: string
  to: string
}

export interface BrandedBackdropProps {
  /** Background gradient for the branded region. */
  gradient?: BrandedBackdropGradient
  /** Solid background color fallback when no gradient is provided. */
  backgroundColor?: string
  /** Height of the painted gradient region in pixels. Defaults to 180. */
  height?: number
  children?: React.ReactNode
}

/**
 * Visual backdrop layer that paints a gradient behind a PageLayout.
 *
 * Renders as a positioned-absolute layer spanning the full grid. The gradient
 * fills only the top `height` pixels; below that the backdrop is transparent,
 * allowing body content cards to naturally overlap the gradient without
 * negative margins.
 *
 * Place this as the first child inside a `PageLayout`:
 *
 * @example
 *   <PageLayout>
 *     <PageLayout.Backdrop
 *       gradient={{ from: colors.blue['900'], to: colors.blue['700'] }}
 *     />
 *     <PageLayout.Header>Nav</PageLayout.Header>
 *     <PageLayout.Body>Content</PageLayout.Body>
 *   </PageLayout>
 */
export const BrandedBackdrop = forwardRef<HTMLDivElement, BrandedBackdropProps>(
  ({ gradient, backgroundColor, height = 180, children }, ref) => {
    const backgroundImage = gradient
      ? `linear-gradient(to bottom right, ${gradient.from}, ${gradient.to})`
      : undefined

    return (
      <Block
        position="absolute"
        top={0}
        left={0}
        right={0}
        height={height}
        gridRow="1 / -1"
        gridColumn="1 / -1"
        zIndex={0}
        backgroundColor={gradient ? undefined : backgroundColor}
        backgroundImage={backgroundImage}
        props={{ ref }}
      >
        {children}
      </Block>
    )
  }
)

BrandedBackdrop.displayName = 'BrandedBackdrop'
