import { Block, Col } from '@jsxstyle/react'
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
 * Renders a prominent title with an optional secondary description line.
 * Use inside a `<Modal>` as the first child.
 */
export const ModalHeader: React.FC<Props> = ({ title, description }) => (
  <Col gap={spacing.xs}>
    <Block {...textStyles.heading2} color={color.text.default} component="h2">
      {title}
    </Block>
    {description && (
      <Block {...textStyles.body} color={color.text.secondary} component="p">
        {description}
      </Block>
    )}
  </Col>
)

ModalHeader.displayName = 'ModalHeader'
