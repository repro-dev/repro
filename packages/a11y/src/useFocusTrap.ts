import { useEffect, useRef } from 'react'
import { FOCUSABLE_SELECTORS } from './focusableSelectors'

export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  active: boolean
): { current: T | null } {
  const containerRef = useRef(null as HTMLElement | null)
  const previousFocusRef = useRef(null as HTMLElement | null)

  useEffect(() => {
    if (!active) {
      if (previousFocusRef.current) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
      return
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null

    const container = containerRef.current
    if (container) {
      const firstFocusable = container.querySelector(
        FOCUSABLE_SELECTORS
      ) as HTMLElement | null
      if (firstFocusable instanceof HTMLElement) {
        firstFocusable.focus()
      } else {
        container.tabIndex = -1
        container.focus()
      }
    }

    const handleKeyDown = (evt: KeyboardEvent) => {
      if (evt.key !== 'Tab' || !container) return

      const focusables = Array.from(
        container.querySelectorAll(FOCUSABLE_SELECTORS)
      ).filter(
        (el): el is HTMLElement =>
          el instanceof HTMLElement && !el.closest('[aria-hidden="true"]')
      )

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
      if (previousFocusRef.current) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
    }
  }, [active])

  return containerRef as { current: T | null }
}
