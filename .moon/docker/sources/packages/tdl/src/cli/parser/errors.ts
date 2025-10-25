import { Interval } from 'ohm-js'

export class MatchError extends Error {
  name = 'MatchError'
  constructor(public message: string, public interval: Interval) {
    super(message)
  }
}

export class ResolutionError extends Error {
  name = 'ResolutionError'
  constructor(public message: string, public interval: Interval) {
    super(message)
  }
}

export class ValidationError extends Error {
  name = 'ValidationError'
  constructor(public message: string, public interval: Interval) {
    super(message)
  }
}

export type ParseError = MatchError | ResolutionError | ValidationError

export function isParseError(error: unknown): error is ParseError {
  return (
    error instanceof MatchError ||
    error instanceof ResolutionError ||
    error instanceof ValidationError
  )
}

export class CollectedParseError extends Error {
  name = 'CollectedParseError'
  constructor(public errors: Array<ParseError>) {
    super(
      errors
        .map((error, n) => `\n\t${n + 1}. ${error.name}: ${error.message}`)
        .join()
    )
  }
}
