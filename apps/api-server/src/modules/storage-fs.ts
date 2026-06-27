import Future, { attempt, chain, FutureInstance, node, reject } from 'fluture'
import {
  access,
  constants,
  createReadStream,
  createWriteStream,
  mkdir,
  unlink,
} from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { notFound, serverError } from '~/utils/errors'
import { Storage } from './storage'

interface Config {
  path: string
  keyPrefix?: string
}

export function createFileSystemStorageClient(config: Config): Storage {
  function prefixedKey(filePath: string): string {
    return config.keyPrefix ? config.keyPrefix + filePath : filePath
  }

  function isSafePath(filePath: string) {
    const relPath = path.relative(config.path, path.join(config.path, filePath))

    if (relPath.startsWith('..')) {
      return false
    }

    return true
  }

  function exists(filePath: string): FutureInstance<Error, boolean> {
    return node(done => {
      const key = prefixedKey(filePath)
      const fullPath = path.join(config.path, key)

      if (!isSafePath(filePath)) {
        done(null, false)
        return
      }

      return access(fullPath, constants.R_OK, err => {
        if (!err) {
          done(null, true)
          return
        }

        if (err.code === 'ENOENT') {
          done(null, false)
          return
        }

        done(err)
      })
    })
  }

  function read(
    filePath: string,
    range?: { start: number; end: number }
  ): FutureInstance<Error, Readable> {
    const key = prefixedKey(filePath)
    return exists(key).pipe(
      chain(pathExists =>
        pathExists
          ? attempt<Error, Readable>(() => {
              const options: { start?: number; end?: number } = {}
              if (range) {
                options.start = range.start
                options.end = range.end
              }
              return createReadStream(path.join(config.path, key), options)
            })
          : reject(notFound(`File does not exist: ${filePath}`))
      )
    )
  }

  function write(
    filePath: string,
    data: Readable
  ): FutureInstance<Error, void> {
    if (!isSafePath(filePath)) {
      return reject(notFound(`File does not exist: ${filePath}`))
    }

    const key = prefixedKey(filePath)
    const fullPath = path.join(config.path, key)
    const dirname = path.dirname(fullPath)

    const ensureDirectory = node<Error, string>(done =>
      mkdir(dirname, { recursive: true }, done)
    )

    return ensureDirectory.pipe(
      chain<Error, string, void>(() =>
        Future((reject, resolve) => {
          const sink = createWriteStream(fullPath)

          function onEnd() {
            sink.close(error => {
              if (error) {
                reject(serverError(error.message))
              } else {
                resolve()
              }
            })
          }

          function onError(error: Error) {
            data.destroy()
            sink.destroy()
            reject(error)
          }

          data.once('end', onEnd)
          sink.once('error', onError)
          data.once('error', onError)

          data.pipe(sink)

          return () => {
            data.off('end', onEnd)
            sink.off('error', onError)
            data.off('error', onError)
          }
        })
      )
    )
  }

  function deleteFile(filePath: string): FutureInstance<Error, void> {
    if (!isSafePath(filePath)) {
      return reject(notFound(`File does not exist: ${filePath}`))
    }

    const key = prefixedKey(filePath)
    const fullPath = path.join(config.path, key)

    return node(done => unlink(fullPath, done))
  }

  return {
    exists,
    read,
    write,
    delete: deleteFile,
  }
}
