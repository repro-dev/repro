import { Block, Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { Text } from '../Text'
import { spacing } from '../tokens/spacing'

interface FieldsetProps {
  heading?: string
  children?: React.ReactNode
}

export const Fieldset = forwardRef<HTMLFieldSetElement, FieldsetProps>(
  ({ heading, children }, ref) => {
    return (
      <Col
        component="fieldset"
        border="none"
        margin={spacing.none}
        padding={spacing.none}
        gap={spacing.xl}
        props={{ ref }}
      >
        {heading != null && (
          <Block marginBottom={spacing.md}>
            <Text variant="heading3" as="legend">
              {heading}
            </Text>
          </Block>
        )}
        {children}
      </Col>
    )
  }
)

Fieldset.displayName = 'Fieldset'
