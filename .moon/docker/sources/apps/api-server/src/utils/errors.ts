type ErrorCtor = {
  new (message?: string | undefined): Error
}

const registry = new Map<string, ErrorCtor>()

export function createError(name: string, message: string = ''): Error {
  let Ctor = registry.get(name)

  if (Ctor == null) {
    Ctor = class extends Error {
      name = name
    }

    registry.set(name, Ctor)
  }

  return new Ctor(message)
}

export function errorType(instance: Error): ErrorCtor {
  return registry.get(instance.name)!
}

export function notAuthenticated(message: string = '') {
  return createError('NotAuthenticatedError', message)
}

export function isNotAuthenticated(error: Error) {
  return error.name === 'NotAuthenticatedError'
}

export function permissionDenied(message: string = '') {
  return createError('PermissionDeniedError', message)
}

export function isPermissionDenied(error: Error) {
  return error.name === 'PermissionDeniedError'
}

export function notFound(message: string = '') {
  return createError('NotFoundError', message)
}

export function isNotFound(error: Error) {
  return error.name === 'NotFoundError'
}

export function badRequest(message: string = '') {
  return createError('BadRequestError', message)
}

export function isBadRequest(error: Error) {
  return error.name === 'BadRequestError'
}

export function resourceConflict(message: string = '') {
  return createError('ResourceConflict', message)
}

export function isResourceConflict(error: Error) {
  return error.name === 'ResourceConflict'
}

export function serverError(message: string = '') {
  return createError('ServerError', message)
}

export function isServerError(error: Error) {
  return error.name === 'ServerError'
}

export function notImplemented(message: string = '') {
  return createError('NotImplemented', message)
}

export function isNotImplemented(error: Error) {
  return error.name === 'NotImplemented'
}

export function serviceUnavailable(message: string = '') {
  return createError('ServiceUnavailable', message)
}

export function isServiceUnavailable(error: Error) {
  return error.name === 'ServiceUnavailable'
}
