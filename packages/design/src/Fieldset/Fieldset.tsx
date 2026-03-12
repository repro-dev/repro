import { Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { Text } from '../Text'
import { spacing } from '../tokens/spacing'

interface FieldsetProps {
  heading?: string
  children?: React.ReactNode
}

/**
 * Styled wrapper around the native `<fieldset>` element for grouping related
 * form fields.
 *
 * Resets browser-default fieldset styling (border, margin, padding) and applies
 * consistent vertical spacing between children via the `spacing.xl` token.
 *
 * When a `heading` is provided it renders as a `<legend>` using the `heading3`
 * text style, giving screen readers an accessible group label.
 *
 * @example
 *   <Fieldset heading="Billing address">
 *     <Input name="street" label="Street" />
 *     <Input name="city" label="City" />
 *   </Fieldset>
 */
export const Fieldset = forwardRef<HTMLFieldSetElement, FieldsetProps>(
  ({ heading, children }, ref) => {
    return (
      <Col
        component="fieldset"
        border="none"
        margin={0}
        padding={0}
        gap={spacing.xl}
        props={{ ref }}
      >
        {heading != null && (
          <Text variant="heading3" as="legend">
            {heading}
          </Text>
        )}
        {children}
      </Col>
    )
  }
)

Fieldset.displayName = 'Fieldset'
