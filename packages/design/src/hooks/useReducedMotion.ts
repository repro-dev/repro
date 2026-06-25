import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * SSR-safe hook that returns `true` when the user prefers reduced motion.
 *
 * Reads `window.matchMedia('(prefers-reduced-motion: reduce)')` on mount,
 * subscribes to runtime preference changes, and returns `false` during SSR
 * or when `matchMedia` is unavailable.
 */
export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return false
    }
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return
    }

    const mql = window.matchMedia(QUERY)

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches)
    }

    mql.addEventListener('change', handleChange)
    return () => {
      mql.removeEventListener('change', handleChange)
    }
  }, [])

  return prefersReducedMotion
}
