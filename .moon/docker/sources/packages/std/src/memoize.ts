type FunctionType = (...args: any[]) => any

export function memoize<T extends FunctionType>(fn: T): T {
  const cache = new Map<string, ReturnType<T>>()

  return function (arg) {
    let value = cache.get(arg)

    if (value === undefined) {
      value = fn(arg)
      cache.set(arg, value!)
    }

    return value
  } as T
}
