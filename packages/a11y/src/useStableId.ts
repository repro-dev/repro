import { useId } from 'react'

export function useStableId(prefix?: string): string {
  const id = useId()

  if (prefix) {
    return `${prefix}-${id}`
  }

  return id
}
