import React, { PropsWithChildren, useContext, useEffect, useRef } from 'react'
import { zIndex } from '../tokens/elevation'

const PortalRootContext = React.createContext<HTMLElement | null>(null)

function createRootElement(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.position = 'fixed'
  el.style.top = '0px'
  el.style.left = '0px'
  el.style.zIndex = `${zIndex.portal}`
  document.body.appendChild(el)
  return el
}

/**
 * Provides a fixed-position root container for `Portal` instances to
 * render into.
 *
 * Place once near the top of the component tree. All `Portal` children
 * will mount into this root, ensuring overlays render above all other
 * content at max z-index.
 *
 * The root element is created synchronously so that child `Portal`
 * components can render into it on the very first paint.
 */
export const PortalRootProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null)

  if (!rootRef.current) {
    rootRef.current = createRootElement()
  }

  useEffect(() => {
    return () => {
      if (rootRef.current) {
        rootRef.current.remove()
        rootRef.current = null
      }
    }
  }, [])

  return (
    <PortalRootContext.Provider value={rootRef.current}>
      {children}
    </PortalRootContext.Provider>
  )
}

function usePortalRoot() {
  return useContext(PortalRootContext)
}

export function usePortalMountPoint() {
  const root = usePortalRoot()
  const mountPointRef = useRef<HTMLDivElement | null>(null)

  // Create the mount point synchronously so Portal children render on the
  // first paint instead of being delayed by an effect + setState cycle.
  if (root && !mountPointRef.current) {
    const elem = document.createElement('div')
    elem.style.position = 'fixed'
    elem.style.top = '0px'
    elem.style.left = '0px'
    elem.style.zIndex = `${zIndex.portal}`
    root.appendChild(elem)
    mountPointRef.current = elem
  }

  useEffect(() => {
    return () => {
      if (mountPointRef.current) {
        mountPointRef.current.remove()
        mountPointRef.current = null
      }
    }
  }, [])

  return mountPointRef.current
}
