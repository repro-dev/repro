import { Col, Row } from '@jsxstyle/react'
import { Button, Modal, Text, TextField, spacing } from '@repro/design'
import React, { useState } from 'react'

interface DeactivateUserDialogProps {
  userName: string
  onConfirm: () => Promise<void>
  onClose: () => void
  confirmError: string | null
  onConfirmError: (error: string | null) => void
}

export const DeactivateUserDialog: React.FC<DeactivateUserDialogProps> = ({
  userName,
  onConfirm,
  onClose,
  confirmError,
  onConfirmError,
}) => {
  const [loading, setLoading] = useState(false)
  const [confirmationName, setConfirmationName] = useState('')
  const canDeactivate = confirmationName === userName

  const handleConfirm = async () => {
    setLoading(true)
    onConfirmError(null)
    try {
      await onConfirm()
    } catch (err) {
      onConfirmError(
        err instanceof Error ? err.message : 'Failed to deactivate user'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      aria-label={`Deactivate ${userName}`}
      width={400}
      height="auto"
    >
      <Modal.Body>
        <Col gap={spacing.md}>
          <Modal.Header
            title={`Deactivate ${userName}?`}
            description="This will permanently deactivate this user. They will lose access to all projects and recordings. This action cannot be undone."
          />
          <Col gap={spacing.md}>
            <Text variant="body">Type {userName} exactly to continue.</Text>
            <TextField
              label="User name"
              id="deactivate-user-confirmation"
              value={confirmationName}
              onChange={event => setConfirmationName(event.target.value)}
              placeholder={userName}
              autoFocus
              disabled={loading}
              invalid={!!confirmError}
              error={confirmError ? { message: confirmError } : undefined}
            />
          </Col>
          <Row justifyContent="flex-end" gap={spacing.md}>
            <Button
              variant="outlined"
              context="neutral"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              context="danger"
              onClick={handleConfirm}
              disabled={loading || !canDeactivate}
            >
              {loading ? 'Deactivating...' : 'Deactivate user'}
            </Button>
          </Row>
        </Col>
      </Modal.Body>
    </Modal>
  )
}
