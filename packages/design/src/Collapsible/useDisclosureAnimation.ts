import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { duration, easing } from '../tokens/motion'

const KEYFRAMES = `
@keyframes repro-disclosure-expand {
  from { max-height: 0; opacity: 0; }
  to { max-height: var(--repro-disclosure-content-height); opacity: 1; }
}
@keyframes repro-disclosure-collapse {
  from { max-height: var(--repro-disclosure-content-height); opacity: 1; }
  to { max-height: 0; opacity: 0; }
}
`

export function injectDisclosureKeyframes(): void {
  if (
    typeof document === 'undefined' ||
    document.getElementById('repro-disclosure-keyframes')
  ) {
    return
  }

  const style = document.createElement('style')
  style.id = 'repro-disclosure-keyframes'
  style.textContent = KEYFRAMES
  document.head.appendChild(style)
}

export function useDisclosureAnimation(open: boolean): {
  contentRef: React.RefObject<HTMLDivElement>
  contentStyle: React.CSSProperties
} {
  const contentRef = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  const [hasMounted, setHasMounted] = useState(false)
  const isReducedMotion = useReducedMotion()

  useEffect(() => {
    injectDisclosureKeyframes()
  }, [])

  useEffect(() => {
    setHeight(contentRef.current?.scrollHeight ?? 0)
    setHasMounted(true)
  }, [open])

  return {
    contentRef,
    contentStyle: useMemo(() => {
      const contentHeight = `${height}px`
      const animation =
        hasMounted && !isReducedMotion
          ? `repro-disclosure-${open ? 'expand' : 'collapse'} ${
              duration[200]
            } ${easing.easeOut} forwards`
          : undefined

      return {
        '--repro-disclosure-content-height': contentHeight,
        maxHeight: open ? contentHeight : 0,
        opacity: open ? 1 : 0,
        animation,
      } as React.CSSProperties
    }, [hasMounted, height, open, isReducedMotion]),
  }
}
