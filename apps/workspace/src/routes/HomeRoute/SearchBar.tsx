import { Input } from '@repro/design'
import React, { useCallback, useEffect, useRef, useState } from 'react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

const DEBOUNCE_MS = 300

export const SearchBar = ({
  value,
  onChange,
  placeholder = 'Search sessions\u2026',
}: Props) => {
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<number | null>(null)

  // Keep local state in sync when parent resets the value externally.
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Cleanup timeout on unmount to prevent onChange firing on unmounted component.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
    }
  }, [])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value
      setLocalValue(next)

      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
      }
      timerRef.current = window.setTimeout(() => {
        onChange(next)
      }, DEBOUNCE_MS)
    },
    [onChange]
  )

  return (
    <Input
      type="search"
      placeholder={placeholder}
      value={localValue}
      onChange={handleChange}
      aria-label="Search sessions"
    />
  )
}
