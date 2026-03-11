import { Block } from '@jsxstyle/react'
import React, {
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { zIndex } from '../tokens/elevation'

const PortalRootContext = React.createContext<HTMLElement | null>(null)

/**
 * Provides a fixed-position root container for `Portal` instances to
 * render into.
 *
 * Place once near the top of the component tree. All `Portal` children
 * will mount into this root, ensuring overlays render above all other
 * content at max z-index.
 *
 * The root element lives inside the React tree so it respects shadow DOM
 * boundaries. A callback ref captures the DOM node after the first
 * commit; the brief `null` frame is invisible because the provider
 * mounts at application startup, well before any overlay opens.
 */
export const PortalRootProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const [root, setRoot] = useState<HTMLElement | null>(null)

  const callbackRef = useCallback((node: HTMLElement | null) => {
    setRoot(node)
  }, [])

  return (
    <>
      <Block
        position="fixed"
        top={0}
        left={0}
        zIndex={zIndex.portal}
        props={{ ref: callbackRef }}
      />
      <PortalRootContext.Provider value={root}>
        {children}
      </PortalRootContext.Provider>
    </>
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
