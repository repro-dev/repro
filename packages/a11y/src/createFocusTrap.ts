import { FOCUSABLE_SELECTORS } from './focusableSelectors'

export interface FocusTrap {
  activate(): void
  deactivate(): void
  destroy(): void
}

export function createFocusTrap(
  container: HTMLElement,
  options?: { initialFocus?: HTMLElement }
): FocusTrap {
  let previousFocus: Element | null = null
  let active = false
  // Track whether we temporarily added tabIndex=-1 so we can restore it on deactivate.
  let addedTabIndex = false

  function isAvailableFocusTarget(el: Element | null): el is HTMLElement {
    return (
      el instanceof HTMLElement &&
      container.contains(el) &&
      !el.closest('[aria-hidden="true"]')
    )
  }

  function getFocusableElements(): HTMLElement[] {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS)).filter(
      isAvailableFocusTarget
    )
  }

  /**
   * Return the validated initialFocus target, or null if it should be ignored.
   * Valid means: present, contained within the trap container, and not inside
   * an aria-hidden subtree.
   */
  function resolveInitialFocus(): HTMLElement | null {
    const target = options?.initialFocus ?? null
    return isAvailableFocusTarget(target) ? target : null
  }

  function handleKeyDown(evt: KeyboardEvent): void {
    if (evt.key !== 'Tab' || !active) return

    const focusables = getFocusableElements()
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

  function activate(): void {
    if (active) return
    active = true
    previousFocus = document.activeElement

    const firstFocusable = resolveInitialFocus() ?? getFocusableElements()[0]
    if (firstFocusable) {
      firstFocusable.focus()
    } else {
      // Temporarily make container focusable so focus can be trapped inside it.
      addedTabIndex = true
      container.tabIndex = -1
      container.focus()
    }

    // Use capture phase so Tab is intercepted even when children call stopPropagation.
    document.addEventListener('keydown', handleKeyDown, true)
  }

  function deactivate(): void {
    if (!active) return
    active = false
    document.removeEventListener('keydown', handleKeyDown, true)

    // Restore any temporary tabIndex we added during activation.
    if (addedTabIndex) {
      container.removeAttribute('tabindex')
      addedTabIndex = false
    }

    if (previousFocus instanceof HTMLElement) {
      previousFocus.focus()
    }
    previousFocus = null
  }

  function destroy(): void {
    deactivate()
    previousFocus = null
  }

  return { activate, deactivate, destroy }
}
