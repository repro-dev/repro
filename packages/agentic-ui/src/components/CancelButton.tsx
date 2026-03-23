import { Button } from '@repro/design'
import React from 'react'

interface CancelButtonProps {
  onClick: () => void
}

export const CancelButton: React.FC<CancelButtonProps> = ({ onClick }) => {
  return (
    <Button context="neutral" size="small" variant="outlined" onClick={onClick}>
      Cancel
    </Button>
  )
}
