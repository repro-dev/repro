import { Block } from '@jsxstyle/react'
import React, {
  MutableRefObject,
  PropsWithChildren,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

const MAX_INT32 = 2 ** 32 - 1

const PortalRootContext = React.createContext<
  MutableRefObject<HTMLElement | null>
>({
  current: null,
})

export const PortalRootProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const root = useRef() as MutableRefObject<HTMLDivElement>

  return (
    <PortalRootContext.Provider value={root}>
      {children}
      <Block
        position="fixed"
        top={0}
        left={0}
        zIndex={MAX_INT32}
        props={{ ref: root }}
      />
    </PortalRootContext.Provider>
  )
}

function usePortalRoot() {
  const root = useContext(PortalRootContext)
  return root.current ?? null
}

export function usePortalMountPoint() {
  const root = usePortalRoot()
  const [mountPoint, setMountPoint] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    let elem: HTMLDivElement | null = null

    if (root) {
      elem = document.createElement('div')
      elem.style.position = 'fixed'
      elem.style.top = '0px'
      elem.style.left = '0px'
      elem.style.zIndex = `${MAX_INT32}`
      root.appendChild(elem)
      setMountPoint(elem)
    }

    return () => {
      if (elem) {
        setMountPoint(null)
        elem.remove()
      }
    }
  }, [root, setMountPoint])

  return mountPoint
}
