import { Col } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { Text } from '../Text/Text'
import { spacing } from '../tokens/spacing'

export interface FormSectionProps {
  heading?: string
  children?: React.ReactNode
}

/**
 * Groups related form fields with an optional section heading.
 *
 * Renders a `<fieldset>` element for semantic grouping. When `heading`
 * is provided, it appears as a `<legend>` via `Text`.
 */
export const FormSection: React.FC<PropsWithChildren<FormSectionProps>> = ({
  heading,
  children,
}) => {
  return (
    <Col
      component="fieldset"
      gap={spacing.xl}
      border="none"
      margin={0}
      padding={0}
    >
      {heading && (
        <Text variant="heading3" as="legend">
          {heading}
        </Text>
      )}
      {children}
    </Col>
  )
}
