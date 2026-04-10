import { useEffect, useRef } from 'react'
import { FOCUSABLE_SELECTORS } from '~/focusableSelectors'

export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null)
  const previousFocusRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!active) {
      if (
        previousFocusRef.current &&
        previousFocusRef.current instanceof HTMLElement
      ) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
      return
    }

    previousFocusRef.current = document.activeElement

    const container = containerRef.current
    if (container) {
      const firstFocusable =
        container.querySelector<HTMLElement>(FOCUSABLE_SELECTORS)
      if (firstFocusable) {
        firstFocusable.focus()
      } else {
        container.tabIndex = -1
        container.focus()
      }
    }

    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key !== 'Tab' || !container) return

      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
      ).filter(el => !el.closest('[aria-hidden="true"]'))

      if (focusables.length === 0) {
        evt.preventDefault()
        return
      }

      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!

      if (evt.shiftKey) {
        if (document.activeElement === first) {
          evt.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          evt.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (
        previousFocusRef.current &&
        previousFocusRef.current instanceof HTMLElement
      ) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
    }
  }, [active])

  return containerRef
}
