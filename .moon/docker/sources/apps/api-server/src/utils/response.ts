import { isLens, unwrapLens } from '@repro/tdl'
import { FastifyReply } from 'fastify'
import { FutureInstance, fork } from 'fluture'
import { isObservable } from 'rxjs'
import { isReadable } from 'stream'
import { SystemConfig } from '~/config/system'
import {
  isBadRequest,
  isNotAuthenticated,
  isNotFound,
  isNotImplemented,
  isPermissionDenied,
  isResourceConflict,
  isServiceUnavailable,
} from './errors'

function isReadableStream(value: any): value is NodeJS.ReadableStream {
  return isReadable(value)
}

export function createResponseUtils(config: SystemConfig) {
  function respondWithError(res: FastifyReply, error: Error) {
    let message: string

    if (isNotFound(error)) {
      message = error.message || 'Not found'
      res.status(404)
    } else if (isNotAuthenticated(error)) {
      message = error.message || 'Not authenticated'
      res.status(401)
    } else if (isPermissionDenied(error)) {
      message = error.message || 'Permission denied'
      res.status(403)
    } else if (isBadRequest(error)) {
      message = error.message || 'Bad request'
      res.status(400)
    } else if (isResourceConflict(error)) {
      message = error.message || 'Conflict'
      res.status(409)
    } else if (isNotImplemented(error)) {
      message = error.message || 'Not implemented'
      res.log.error(error)
      res.status(501)
    } else if (isServiceUnavailable(error)) {
      message = config.debug ? error.message : 'Service unavailable'
      res.log.error(error)
      res.status(503)
    } else {
      message = config.debug ? error.message : 'Server error'
      res.log.error(error)
      res.status(500)
    }

    res.type('application/json')
    res.send({ name: error.name, message })
  }

  function respondWithValue<T>(res: FastifyReply, value: T, status?: number) {
    if (value === null || value === undefined) {
      res.status(status ?? 204)
      res.send()
    } else {
      res.status(status ?? 200)

      if (isReadableStream(value)) {
        res.send(value)
      } else if (isObservable(value)) {
        res.type('text/plain')
        value.subscribe({
          next: data => res.raw.write(data),
          complete: () => res.raw.end(),

          // TODO
          error: error => {
            console.error(error)
          },
        })
      } else if (isLens(value)) {
        res.type('application/octet-stream')
        const view = unwrapLens(value)
        res.send(Buffer.from(view.buffer))
      } else {
        res.type('application/json')
        res.send(value)
      }
    }
  }

  function respondWith<T>(
    res: FastifyReply,
    future: FutureInstance<Error, T>,
    status?: number
  ) {
    fork<Error>(error => respondWithError(res, error))<T>(value =>
      respondWithValue<T>(res, value, status)
    )(future)
  }

  return {
    respondWithError,
    respondWithValue,
    respondWith,
  }
}

export type ResponseUtils = ReturnType<typeof createResponseUtils>
