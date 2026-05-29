import React from 'react'
import { Modal } from '../Modal'
import { PostRecordingSurface } from './PostRecordingSurface'

interface PostRecordingSurfaceModalProps {
  open: boolean
  projectId: string | null
  onClose: () => void
}

export const PostRecordingSurfaceModal: React.FC<
  PostRecordingSurfaceModalProps
> = ({ open, projectId, onClose }) => (
  <Modal
    title="Session Inspector"
    size="full-screen"
    open={open}
    onClose={onClose}
  >
    <PostRecordingSurface projectId={projectId} onClose={onClose} />
  </Modal>
)
