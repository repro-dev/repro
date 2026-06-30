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
 * Cmd+K / Cmd+P toggles the palette from any element.
 * Escape closes when open.
 */
export function useCommandPalette(): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape closes the palette when open
      if (event.key === 'Escape' && isOpen) {
        event.preventDefault()
        setIsOpen(false)
        return
      }

      // Cmd+K or Cmd+P toggles palette — globally, from any element
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === 'k' || event.key === 'p')
      ) {
        event.preventDefault()
        setIsOpen(prev => !prev)
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [isOpen])

  return { isOpen, open, close, toggle }
}
