type Primitive =
  | number
  | string
  | boolean
  | symbol
  | undefined
  | null
  | void
  | Function
  | Date
  | ArrayBuffer

type BoxLike<T> = {
  unwrap(): T
}

export type DeeplyUnboxed<T> = T extends Primitive
  ? T
  : T extends BoxLike<infer U>
  ? DeeplyUnboxed<U>
  : T extends object
  ? { [K in keyof T]: DeeplyUnboxed<T[K]> }
  : T

function isBoxLike(value: unknown): value is BoxLike<unknown> {
  return (
    value != null &&
    typeof value === 'object' &&
    'unwrap' in value &&
    typeof (value as { unwrap?: unknown }).unwrap === 'function'
  )
}

export function deepUnbox<T>(value: T): DeeplyUnboxed<T> {
  if (isBoxLike(value)) {
    return deepUnbox(value.unwrap()) as DeeplyUnboxed<T>
  }

  if (Array.isArray(value)) {
    return value.map(item => deepUnbox(item)) as DeeplyUnboxed<T>
  }

  if (value != null && typeof value === 'object') {
    if (value instanceof Date) {
      return value as DeeplyUnboxed<T>
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepUnbox(entry)])
    ) as DeeplyUnboxed<T>
  }

  return value as DeeplyUnboxed<T>
}
