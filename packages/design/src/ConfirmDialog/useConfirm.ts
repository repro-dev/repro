import { useContext } from 'react'
import { ConfirmOptions } from './ConfirmDialog'
import { ConfirmDialogContext } from './ConfirmDialogProvider'

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const context = useContext(ConfirmDialogContext)

  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmDialogProvider')
  }

  return context
}
