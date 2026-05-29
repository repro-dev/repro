import { RefObject, useLayoutEffect } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const previousTabIndexAttribute = 'data-repro-previous-tabindex'

function restoreTabIndex(element: HTMLElement) {
  if (!element.hasAttribute(previousTabIndexAttribute)) return

  const previousTabIndex = element.getAttribute(previousTabIndexAttribute)
  element.removeAttribute(previousTabIndexAttribute)

  if (previousTabIndex === '') {
    element.removeAttribute('tabindex')
    return
  }

  if (previousTabIndex !== null) {
    element.setAttribute('tabindex', previousTabIndex)
  }
}

/** Keeps hidden disclosure panel descendants out of sequential keyboard focus. */
export function useDisclosureFocusContainment(
  panelRef: RefObject<HTMLElement | null>,
  isOpen: boolean
) {
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    const focusableElements = Array.from(
      panel.querySelectorAll<HTMLElement>(focusableSelector)
    )

    if (isOpen) {
      focusableElements.forEach(restoreTabIndex)
      return
    }

    focusableElements.forEach(element => {
      if (!element.hasAttribute(previousTabIndexAttribute)) {
        element.setAttribute(
          previousTabIndexAttribute,
          element.getAttribute('tabindex') ?? ''
        )
      }
      element.tabIndex = -1
    })

    if (document.activeElement instanceof HTMLElement) {
      const activeElement = document.activeElement
      if (panel.contains(activeElement)) {
        activeElement.blur()
      }
    }
  }, [isOpen, panelRef])
}
