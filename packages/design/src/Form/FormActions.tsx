import { Row } from '@jsxstyle/react'
import React, { PropsWithChildren } from 'react'
import { spacing } from '../tokens/spacing'

/**
 * Horizontal layout wrapper for form action buttons (submit, cancel, etc.).
 *
 * Renders a `Row` with standard gap and right-alignment. Place inside a
 * `Form` after all `Form.Field` elements.
 */
export const FormActions: React.FC<PropsWithChildren> = ({ children }) => {
  return (
    <Row gap={spacing.md} justifyContent="flex-end">
      {children}
    </Row>
  )
}
