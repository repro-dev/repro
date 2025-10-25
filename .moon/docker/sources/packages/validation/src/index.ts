import { attemptP, mapRej } from 'fluture'
import z, { ZodError, ZodSchema } from 'zod'

export function invalid(message: string) {
  return new (class extends Error {
    name = 'ValidationError'
    message = message
  })()
}

export function isValidationError(error: Error) {
  return error.name === 'ValidationError'
}

export function parseSchema<S extends ZodSchema<any>>(
  schema: S,
  data: z.infer<S>,
  errorFactory: (reason: string) => Error = invalid
) {
  return attemptP<ZodError, z.infer<S>>(() => schema.parseAsync(data)).pipe(
    mapRej(err => errorFactory(err.toString()))
  )
}
