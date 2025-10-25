import { CollectedParseError } from './errors'

export function throwFirst<R>(callback: () => R): R {
  return throwFirstOfType(Error, callback)
}

export function throwFirstOfType<E extends Function, R>(
  Ctor: E,
  callback: () => R
): R {
  try {
    return callback()
  } catch (error) {
    if (error instanceof CollectedParseError) {
      const firstError = error.errors.find(error => error instanceof Ctor)

      if (firstError) {
        throw firstError
      }
    }

    throw error
  }
}
