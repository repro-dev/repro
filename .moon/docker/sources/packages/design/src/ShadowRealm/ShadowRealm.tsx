import React, { MutableRefObject, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

type Elements = JSX.IntrinsicElements
type Keys = keyof Elements

type Props<T extends Keys> = React.PropsWithChildren<{
  component: T
  props: Elements[T]
}>

export function ShadowRealm<T extends Keys>({
  children,
  component,
  props,
}: Props<T>) {
  const ref = useRef() as MutableRefObject<HTMLElement>
  const [root, setRoot] = useState<ShadowRoot | null>(null)

  useEffect(() => {
    if (ref.current) {
      setRoot(ref.current.attachShadow({ mode: 'open' }))
    }
  }, [ref, setRoot])

  return React.createElement(
    component,
    { ...props, ref },
    <>{root && createPortal(children, root)}</>
  )
}
