import { FrameRealm } from '@repro/design'
import React, {
  MutableRefObject,
  PropsWithChildren,
  useCallback,
  useContext,
  useRef,
} from 'react'
import { createCSSPropertyMap, CSSPropertyMap } from './utils'

const ReferenceStyleContext = React.createContext<
  (tagName: string) => CSSPropertyMap | null
>(() => null)

export const ReferenceStyleProvider: React.FC<PropsWithChildren> = ({
  children,
}) => {
  const cache = useRef(new Map<string, CSSPropertyMap>())
  const frameRef = useRef() as MutableRefObject<HTMLIFrameElement>

  const getReferenceStyle = useCallback(
    (tagName: string) => {
      let styleMap = cache.current.get(tagName)

      if (styleMap) {
        return styleMap
      }

      const frame = frameRef.current

      if (!frame || !frame.contentWindow || !frame.contentDocument) {
        return null
      }

      const win = frame.contentWindow
      const doc = frame.contentDocument
      const body = doc.createElement('body')
      const referenceElement = doc.createElement(tagName)
      body.appendChild(referenceElement)
      doc.documentElement.appendChild(body)

      const computedStyle = win.getComputedStyle(referenceElement)
      styleMap = createCSSPropertyMap(computedStyle)
      cache.current.set(tagName, styleMap)

      referenceElement.remove()

      return styleMap
    },
    [cache, frameRef]
  )

  return (
    <ReferenceStyleContext.Provider value={getReferenceStyle}>
      <FrameRealm ref={frameRef} style={{ width: 0, height: 0 }} />
      {children}
    </ReferenceStyleContext.Provider>
  )
}

export function useReferenceStyle() {
  return useContext(ReferenceStyleContext)
}
