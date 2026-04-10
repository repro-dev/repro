import { FOCUSABLE_SELECTORS } from '~/focusableSelectors'

export interface FocusTrap {
  activate(): void
  deactivate(): void
  destroy(): void
}

export function createFocusTrap(container: HTMLElement): FocusTrap {
  let previousFocus: Element | null = null
  let active = false

  function getFocusableElements(): HTMLElement[] {
    return Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    ).filter(el => !el.closest('[aria-hidden="true"]'))
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

    const firstFocusable =
      container.querySelector<HTMLElement>(FOCUSABLE_SELECTORS)
    if (firstFocusable) {
      firstFocusable.focus()
    } else {
      container.tabIndex = -1
      container.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
  }

  function deactivate(): void {
    if (!active) return
    active = false
    document.removeEventListener('keydown', handleKeyDown)

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
