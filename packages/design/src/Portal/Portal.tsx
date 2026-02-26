import React, { PropsWithChildren } from 'react'
import { createPortal } from 'react-dom'
import { usePortalMountPoint } from './PortalRootProvider'

/**
 * Renders children into the nearest `PortalRootProvider` mount point
 * via `ReactDOM.createPortal`.
 *
 * Use for overlays, tooltips, and drawers that must escape their parent's
 * stacking context. Returns `null` if no `PortalRootProvider` is present.
 */
export const Portal: React.FC<PropsWithChildren> = ({ children }) => {
  const mountPoint = usePortalMountPoint()

  if (mountPoint) {
    return createPortal(children, mountPoint)
  }

  return null
}
