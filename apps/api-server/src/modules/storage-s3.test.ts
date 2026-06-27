import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  InvalidRequest,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from '@aws-sdk/client-s3'
import { sdkStreamMixin } from '@smithy/util-stream'
import { AwsStub, mockClient } from 'aws-sdk-client-mock'
import expect from 'expect'
import { chain, done } from 'fluture'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { setUpTestS3Storage } from '~/testing/storage'
import { readableToString, stringToReadable } from '~/testing/utils'
import { Storage } from './storage'
import { createS3StorageClient } from './storage-s3'

describe('Modules > S3Storage keyPrefix', () => {
  let reset: () => Promise<void>
  let storage: Storage
  let s3Mock: AwsStub<
    ServiceInputTypes,
    ServiceOutputTypes,
    S3ClientResolvedConfig
  >

  beforeEach(async () => {
    const {
      storage: storageInstance,
      s3Mock: mockInstance,
      close: closeStorage,
    } = await setUpTestS3Storage({ keyPrefix: 'wt-foo/' })
    storage = storageInstance
    s3Mock = mockInstance
    reset = closeStorage
  })

  afterEach(async () => {
    await reset()
  })

  it('should prepend keyPrefix when checking existence', () => {
    s3Mock
      .on(HeadObjectCommand)
      .rejects(new NotFound({ $metadata: {}, message: '' }))

    s3Mock.on(HeadObjectCommand, { Key: 'wt-foo/bar' }).resolves({})

    return new Promise<void>(next => {
      done<Error, boolean>((err, exists) => {
        expect(err).toBeNull()
        expect(exists).toEqual(true)
        next()
      })(storage.exists('bar'))
    })
  })

  it('should prepend keyPrefix when reading', () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: sdkStreamMixin(Readable.from(['prefix-data'])),
    })

    s3Mock.on(GetObjectCommand, { Key: 'wt-foo/bar' }).resolves({
      Body: sdkStreamMixin(Readable.from(['prefixed-data'])),
    })

    return new Promise<void>(next => {
      done<Error, string>((err, output) => {
        expect(err).toBeNull()
        expect(output).toEqual('prefixed-data')
        next()
      })(
        storage.read('bar').pipe(chain(readable => readableToString(readable)))
      )
    })
  })

  it('should prepend keyPrefix when writing', () => {
    s3Mock
      .on(PutObjectCommand)
      .rejects(new InvalidRequest({ $metadata: {}, message: '' }))

    s3Mock.on(PutObjectCommand, { Key: 'wt-foo/bar' }).resolves({})

    return new Promise<void>(next => {
      done<Error, void>(err => {
        expect(err).toBeNull()
        next()
      })(
        stringToReadable('bar-data').pipe(
          chain(readable => storage.write('bar', readable))
        )
      )
    })
  })

  it('should prepend keyPrefix when deleting', () => {
    s3Mock
      .on(DeleteObjectCommand)
      .rejects(new InvalidRequest({ $metadata: {}, message: '' }))

    s3Mock.on(DeleteObjectCommand, { Key: 'wt-foo/bar' }).resolves({})

    return new Promise<void>(next => {
      done<Error, void>(err => {
        expect(err).toBeNull()
        next()
      })(storage.delete('bar'))
    })
  })

  it('should work without a keyPrefix (empty string)', () => {
    const s3Mock2 = mockClient(S3Client)
    const storageNoPrefix = createS3StorageClient({
      endpoint: 'http://repro-test-endpoint',
      region: 'repro-test-region',
      bucket: 'repro-test-bucket',
      accessKeyId: '',
      secretAccessKey: '',
      keyPrefix: '',
    })

    s3Mock2.on(HeadObjectCommand, { Key: 'bar' }).resolves({})

    s3Mock2
      .on(HeadObjectCommand, { Key: 'wt-foo/bar' })
      .rejects(new NotFound({ $metadata: {}, message: '' }))

    // Without prefix, 'bar' should be used as-is and resolve successfully.
    // 'wt-foo/bar' should NOT be used, confirming prefix is not prepended.
    return new Promise<void>(next => {
      done<Error, boolean>((err, exists) => {
        expect(err).toBeNull()
        expect(exists).toEqual(true)
        s3Mock2.restore()
        next()
      })(storageNoPrefix.exists('bar'))
    })
  })
})

describe('Modules > S3Storage', () => {
  let reset: () => Promise<void>
  let storage: Storage
  let s3Mock: AwsStub<
    ServiceInputTypes,
    ServiceOutputTypes,
    S3ClientResolvedConfig
  >

  beforeEach(async () => {
    const {
      storage: storageInstance,
      s3Mock: mockInstance,
      close: closeStorage,
    } = await setUpTestS3Storage()
    storage = storageInstance
    s3Mock = mockInstance
    reset = closeStorage
  })

  afterEach(async () => {
    await reset()
  })

  it('should return true for a key that exists', () => {
    s3Mock
      .on(HeadObjectCommand)
      .rejects(new NotFound({ $metadata: {}, message: '' }))

    s3Mock.on(HeadObjectCommand, { Key: 'foo/bar' }).resolves({})

    return new Promise<void>(next => {
      done<Error, boolean>((err, exists) => {
        expect(err).toBeNull()
        expect(exists).toEqual(true)
        next()
      })(storage.exists('foo/bar'))
    })
  })

  it('should return false for a key that does not exist', () => {
    s3Mock.on(HeadObjectCommand).resolves({})

    s3Mock
      .on(HeadObjectCommand, { Key: 'does/not/exist' })
      .rejects(new NotFound({ $metadata: {}, message: '' }))

    return new Promise<void>(next => {
      done<Error, boolean>((err, exists) => {
        expect(err).toBeNull()
        expect(exists).toEqual(false)
        next()
      })(storage.exists('does/not/exist'))
    })
  })

  it('should stream the correct output when reading a file', () => {
    s3Mock.on(GetObjectCommand).resolves({
      Body: sdkStreamMixin(Readable.from(['foo-bar-data'])),
    })

    return new Promise<void>(next => {
      done<Error, string>((err, output) => {
        expect(err).toBeNull()
        expect(output).toEqual('foo-bar-data')
        next()
      })(
        storage
          .read('foo/bar')
          .pipe(chain(readable => readableToString(readable)))
      )
    })
  })

  it('should return not-found when reading a file that does not exist', () => {
    s3Mock.on(GetObjectCommand).resolves({})

    s3Mock
      .on(GetObjectCommand, { Key: 'foo/bar' })
      .rejects(new NotFound({ $metadata: {}, message: '' }))

    return new Promise<void>(next => {
      done<Error, Readable>((err, readable) => {
        expect(err).toMatchObject({
          name: 'NotFound',
        })
        expect(readable).toBeUndefined()
        next()
      })(storage.read('foo/bar'))
    })
  })

  it('should write a file with a nested key path', () => {
    s3Mock
      .on(PutObjectCommand)
      .rejects(new InvalidRequest({ $metadata: {}, message: '' }))

    s3Mock.on(PutObjectCommand, { Key: 'foo/bar' }).resolves({})

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
})
