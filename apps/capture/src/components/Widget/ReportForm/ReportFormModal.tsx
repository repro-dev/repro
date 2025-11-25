import React from 'react'
import { Modal } from '../Modal'
import { ReportForm, ReportFormProps } from './ReportForm'

export interface ReportFormModalProps extends ReportFormProps {
  open: boolean
}

export const ReportFormModal: React.FC<ReportFormModalProps> = ({
  open,
  onClose,
  ...restProps
}) => (
  <Modal
    title="Create a bug report"
    size="full-screen"
    open={open}
    onClose={onClose}
  >
    <ReportForm {...restProps} onClose={onClose} />
  </Modal>
)
