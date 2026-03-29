import { Col, Row } from '@jsxstyle/react'
import React from 'react'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

export type ConfirmVariant = 'default' | 'destructive'

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: ConfirmVariant
}

type Props = ConfirmOptions & {
  open: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const ConfirmDialog: React.FC<Props> = ({
  open,
  onConfirm,
  onCancel,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
}) => {
  return (
    <Modal
      width={400}
      height="auto"
      open={open}
      onClose={onCancel}
      aria-label={title}
    >
      <Col padding={spacing['2xl']} gap={spacing.xl}>
        <Col gap={spacing.md}>
          <Row
            {...textStyles.heading3}
            color={color.text.default}
            component="h2"
          >
            {title}
          </Row>
          {description && (
            <Row
              {...textStyles.bodySmall}
              color={color.text.secondary}
              component="p"
            >
              {description}
            </Row>
          )}
        </Col>
        <Row justifyContent="flex-end" gap={spacing.md}>
          <Button
            variant="outlined"
            context="neutral"
            size="medium"
            rounded
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="contained"
            context={variant === 'destructive' ? 'danger' : 'info'}
            size="medium"
            rounded
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </Row>
      </Col>
    </Modal>
  )
}

ConfirmDialog.displayName = 'ConfirmDialog'
