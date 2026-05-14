export function encodeJson(value: unknown): string {
  return JSON.stringify(value)
}

export function encodeJsonArray(value: readonly unknown[]): string {
  return JSON.stringify(value)
}

export function decodeJson<T>(
  value: string | null | undefined,
  fallback: T
): T {
  if (value === null || value === undefined || value === '') {
    return fallback
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function decodeJsonNullable<T>(
  value: string | null | undefined
): T | null {
  if (value === null || value === undefined || value === '') {
    return null
  }

  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export function decodeJsonArray<T>(value: string | null | undefined): T[] {
  return decodeJson<T[]>(value, [])
}
