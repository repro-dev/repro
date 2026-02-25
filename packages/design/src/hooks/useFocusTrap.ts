import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'details > summary',
].join(', ')

/**
 * Traps keyboard focus within a container element while the trap is active.
 *
 * When `active` is true:
 * - Tab/Shift+Tab cycles focus only among focusable descendants of the
 *   container element.
 * - Focus is moved into the container (to the first focusable child, or the
 *   container itself if none) when the trap becomes active.
 * - Focus is restored to the element that was focused before the trap was
 *   activated when the trap is deactivated.
 *
 * @param active - Whether the focus trap is currently active.
 * @returns A ref to attach to the container element.
 *
 * @example
 * const containerRef = useFocusTrap(isOpen)
 * <div ref={containerRef} role="dialog" aria-modal="true">...</div>
 */
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T>(null)
  const previousFocusRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!active) {
      // Restore focus when trap deactivates
      if (
        previousFocusRef.current &&
        previousFocusRef.current instanceof HTMLElement
      ) {
        previousFocusRef.current.focus()
        previousFocusRef.current = null
      }
      return
    }

    // Capture the currently focused element so we can restore it later
    previousFocusRef.current = document.activeElement

    // Move focus into the container
    const container = containerRef.current
    if (container) {
      const firstFocusable = container.querySelector<HTMLElement>(
        FOCUSABLE_SELECTORS
      )
      if (firstFocusable) {
        firstFocusable.focus()
      } else {
        // Make the container itself focusable as a fallback
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
        // Shift+Tab: if focus is on first element, wrap to last
        if (document.activeElement === first) {
          evt.preventDefault()
          last.focus()
        }
      } else {
        // Tab: if focus is on last element, wrap to first
        if (document.activeElement === last) {
          evt.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus if the component unmounts while the trap is still active
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
