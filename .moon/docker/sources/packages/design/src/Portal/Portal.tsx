import React, { PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'
import { usePortalMountPoint } from './PortalRootProvider'

export const Portal: React.FC<PropsWithChildren> = ({ children }) => {
  const mountPoint = usePortalMountPoint()

  if (mountPoint) {
    return createPortal(children, mountPoint)
  }

  return null
}
