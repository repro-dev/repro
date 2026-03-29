import { Col, Row } from '@jsxstyle/react'
import React from 'react'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { spacing } from '../tokens/spacing'

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
  if (!open) {
    return null
  }

  return (
    <Modal width={400} height="auto" onClose={onCancel} aria-label={title}>
      <Col padding={spacing.xl} gap={spacing.md}>
        <Modal.Header title={title} description={description} />
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
