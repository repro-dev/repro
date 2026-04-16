import { Row } from '@jsxstyle/react'
import { Button, Modal, spacing } from '@repro/design'
import React, { useState } from 'react'

interface DeactivateUserDialogProps {
  userName: string
  onConfirm: () => void
  onClose: () => void
}

export const DeactivateUserDialog: React.FC<DeactivateUserDialogProps> = ({
  userName,
  onConfirm,
  onClose,
}) => {
  const [loading, setLoading] = useState(false)

  const handleConfirm = async () => {
    setLoading(true)
    try {
      await onConfirm()
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
      <Modal.Header title={`Deactivate ${userName}?`} />
      <Row
        component="p"
        paddingV={spacing.lg}
        paddingH={spacing.xl}
        {...{ fontSize: 14, lineHeight: 1.5 }}
      >
        This will permanently deactivate this user. They will lose access to all
        projects and recordings. This action cannot be undone.
      </Row>
      <Row justifyContent="flex-end" gap={spacing.md} padding={spacing.xl}>
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
          disabled={loading}
        >
          {loading ? 'Deactivating...' : 'Deactivate user'}
        </Button>
      </Row>
    </Modal>
  )
}
