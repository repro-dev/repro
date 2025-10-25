import {
  GetObjectCommand,
  HeadObjectCommand,
  InvalidRequest,
  NotFound,
  PutObjectCommand,
  S3ClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from '@aws-sdk/client-s3'
import { sdkStreamMixin } from '@smithy/util-stream'
import { AwsStub } from 'aws-sdk-client-mock'
import expect from 'expect'
import { chain, done } from 'fluture'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { setUpTestS3Storage } from '~/testing/storage'
import { readableToString, stringToReadable } from '~/testing/utils'
import { Storage } from './storage'

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
