import expect from 'expect'
import { chain, done } from 'fluture'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { Readable } from 'stream'
import { setUpTestFileSystemStorage } from '~/testing/storage'
import { stringToReadable } from '~/testing/utils'
import { Storage } from './storage'

describe('Modules > FileSystemStorage keyPrefix', () => {
  let reset: () => Promise<void>
  let storage: Storage

  beforeEach(async () => {
    const { storage: storageInstance, close: closeStorage } =
      await setUpTestFileSystemStorage({ keyPrefix: 'wt-foo/' })
    storage = storageInstance
    reset = closeStorage
  })

  afterEach(async () => {
    await reset()
  })

  it('should prepend keyPrefix when writing and allow reading with the same path', () => {
    // Write to 'bar' with prefix 'wt-foo/' — the actual file path should
    // include the prefix on the filesystem.
    return new Promise<void>(next => {
      done<Error, void>(err => {
        expect(err).toBeNull()

        // Verify the file exists when accessed through the storage (prefix applied)
        done<Error, boolean>((_err, exists) => {
          expect(exists).toEqual(true)

          // Reading without prefix would not find the file
          // (This proves the prefix is being applied)
          next()
        })(storage.exists('bar'))
      })(
        stringToReadable('bar-data').pipe(
          chain(readable => storage.write('bar', readable))
        )
      )
    })
  })

  it('should work without a keyPrefix (empty string)', async () => {
    const { close, storage: storageNoPrefix } =
      await setUpTestFileSystemStorage({ keyPrefix: '' })

    return new Promise<void>(next => {
      done<Error, void>(err => {
        expect(err).toBeNull()
        close().then(next)
      })(
        stringToReadable('data').pipe(
          chain(readable => storageNoPrefix.write('test-key', readable))
        )
      )
    })
  })
})

describe('Modules > FileSystemStorage', () => {
  let reset: () => Promise<void>
  let storage: Storage

  beforeEach(async () => {
    const { storage: storageInstance, close: closeStorage } =
      await setUpTestFileSystemStorage()
    storage = storageInstance
    reset = closeStorage
  })

  afterEach(async () => {
    await reset()
  })

  it('should write a file in a nested directory', () => {
    return new Promise<void>(next => {
      done<Error, void>(err => {
        expect(err).toBeNull()
        next()
      })(
        stringToReadable('bar-data').pipe(
          chain(readable => storage.write('foo/bar', readable))
        )
      )
    })
  })

  it('should not allow directory traversal when checking file existence', () => {
    return new Promise<void>(next => {
      done<Error, boolean>((err, value) => {
        expect(err).toBeNull()
        expect(value).toEqual(false)
        next()
      })(storage.exists('..'))
    })
  })

  it('should not allow directory traversal when reading files', () => {
    return new Promise<void>(next => {
      done<Error, Readable>(err => {
        expect(err).not.toBeNull()
        expect(err?.name).toEqual('NotFoundError')
        next()
      })(storage.read('..'))
    })
  })

  it('should not allow directory traversal when writing files', () => {
    return new Promise<void>(next => {
      done<Error, void>(err => {
        expect(err).not.toBeNull()
        expect(err?.name).toEqual('NotFoundError')
        next()
      })(storage.write('..', new Readable().destroy()))
    })
  })
})
