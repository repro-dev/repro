import { Col, Row } from '@jsxstyle/react'
import React from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

interface Props {
  title: string
  description?: string
}

/**
 * Standard header slot for modal dialogs.
 *
 * Renders a compact title (label text style) with an optional secondary
 * description line. Use inside a `<Modal>` as the first child.
 */
export const ModalHeader: React.FC<Props> = ({ title, description }) => (
  <Col gap={spacing.sm}>
    <Row {...textStyles.label} color={color.text.default} component="h2">
      {title}
    </Row>
    {description && (
      <Row {...textStyles.bodySmall} color={color.text.secondary} component="p">
        {description}
      </Row>
    )}
  </Col>
)

ModalHeader.displayName = 'ModalHeader'
