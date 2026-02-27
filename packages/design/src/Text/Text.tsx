import { Block, InlineBlock } from '@jsxstyle/react'
import React from 'react'
import { color } from '../tokens/colors'
import { fontWeight as fontWeightTokens, textStyles } from '../tokens/typography'
import type { TextStyleToken } from '../tokens/typography'

type TextVariant = TextStyleToken

/**
 * Default HTML element for each text variant.
 *
 * Headings map to their semantic heading level. Body variants map to `<p>`.
 * Inline-oriented variants (caption, label, code) map to `<span>`.
 */
const defaultElementMap: Record<TextVariant, keyof JSX.IntrinsicElements> = {
  display: 'h1',
  heading1: 'h1',
  heading2: 'h2',
  heading3: 'h3',
  body: 'p',
  bodySmall: 'p',
  caption: 'span',
  label: 'label',
  code: 'code',
  overline: 'span',
}

/**
 * Variants that render as inline elements by default and should use
 * `InlineBlock` instead of `Block` to preserve inline flow.
 */
const inlineVariants = new Set<TextVariant>([
  'caption',
  'label',
  'code',
  'overline',
])

type FontWeightToken = keyof typeof fontWeightTokens

interface TextProps {
  /** Text style variant. Determines font size, weight, line height, and family. */
  variant?: TextVariant
  /**
   * Semantic color override from `color.text.*` or any status color token.
   * Defaults to `color.text.default`.
   */
  color?: string
  /** Font weight override from the weight token scale. */
  weight?: FontWeightToken
  /**
   * Rendered HTML element. Defaults to a sensible element for the variant
   * (e.g. `heading1` renders as `<h1>`, `body` as `<p>`, `label` as `<label>`).
   */
  as?: keyof JSX.IntrinsicElements
  /** Whether to truncate overflow with an ellipsis. */
  truncate?: boolean
  children?: React.ReactNode
}

/**
 * Semantic text component backed by the typography token scale.
 *
 * Provides a constrained API for rendering text with design-system-sanctioned
 * styles. Each `variant` maps to a composite text style preset from
 * `textStyles`, and the component renders the appropriate semantic HTML element
 * by default.
 *
 * Use `Text` instead of applying `fontSize` / `fontWeight` / `lineHeight`
 * directly on jsxstyle primitives.
 *
 * @example
 *   <Text variant="heading1">Page Title</Text>
 *   <Text variant="body">Paragraph content here.</Text>
 *   <Text variant="caption" color={color.text.muted}>Updated 2 min ago</Text>
 *   <Text variant="code">{'const x = 1'}</Text>
 */
export const Text = React.forwardRef<HTMLElement, TextProps>(
  (
    { variant = 'body', color: colorProp, weight, as, truncate, children },
    ref
  ) => {
    const style = textStyles[variant]
    const element = as ?? defaultElementMap[variant]
    const Component = inlineVariants.has(variant) ? InlineBlock : Block

    return (
      <Component
        component={element}
        {...style}
        color={colorProp ?? color.text.default}
        {...(weight != null && { fontWeight: fontWeightTokens[weight] })}
        {...(truncate && {
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        })}
        props={{ ref }}
      >
        {children}
      </Component>
    )
  }
)

Text.displayName = 'Text'
