import { useCallback, useEffect, useState } from 'react'

interface UseCommandPaletteReturn {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

/**
 * Global keyboard shortcut hook for the command palette.
 *
 * Cmd+K / Cmd+P toggles the palette.
 * Escape closes when open.
 * Skips events originating from `<input>`, `<textarea>`, or `[contenteditable]`.
 */
export function useCommandPalette(): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if the event originated from an input-like element
      const target = event.target as Node | null
      if (target && target.nodeType === Node.ELEMENT_NODE) {
        const el = target as HTMLElement
        const tagName = el.tagName.toLowerCase()
        if (
          tagName === 'input' ||
          tagName === 'textarea' ||
          el.isContentEditable
        ) {
          return
        }
      }

      if (event.key === 'Escape' && isOpen) {
        event.preventDefault()
        setIsOpen(false)
        return
      }

      // Cmd+K or Cmd+P toggles palette
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === 'k' || event.key === 'p')
      ) {
        event.preventDefault()
        setIsOpen(prev => !prev)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  return { isOpen, open, close, toggle }
}
