import Future, { attempt, chain, FutureInstance, node, reject } from 'fluture'
import {
  access,
  constants,
  createReadStream,
  createWriteStream,
  mkdir,
} from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { notFound, serverError } from '~/utils/errors'
import { Storage } from './storage'

interface Config {
  path: string
}

export function createFileSystemStorageClient(config: Config): Storage {
  function isSafePath(filePath: string) {
    const relPath = path.relative(config.path, path.join(config.path, filePath))

    if (relPath.startsWith('..')) {
      return false
    }

    return true
  }

  function exists(filePath: string): FutureInstance<Error, boolean> {
    return node(done => {
      const fullPath = path.join(config.path, filePath)

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

  function read(filePath: string): FutureInstance<Error, Readable> {
    return exists(filePath).pipe(
      chain(pathExists =>
        pathExists
          ? attempt<Error, Readable>(() => {
              return createReadStream(path.join(config.path, filePath))
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

    const fullPath = path.join(config.path, filePath)
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

  return {
    exists,
    read,
    write,
  }
}
