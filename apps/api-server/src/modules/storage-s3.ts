import {
  CompleteMultipartUploadCommandOutput,
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectCommandOutput,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  S3Client,
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import {
  attemptP,
  bichain,
  FutureInstance,
  map,
  reject,
  resolve,
} from 'fluture'
import { Readable } from 'node:stream'
import { Storage } from './storage'

interface Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
  keyPrefix?: string
}

export function createS3StorageClient(config: Config): Storage {
  function prefixedKey(path: string): string {
    return config.keyPrefix ? config.keyPrefix + path : path
  }

  const s3 = new S3Client({
    endpoint: config.endpoint,
    forcePathStyle: true,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

  function exists(path: string): FutureInstance<Error, boolean> {
    const key = prefixedKey(path)
    const res = attemptP<Error, HeadObjectCommandOutput>(() =>
      s3.send(
        new HeadObjectCommand({
          Bucket: config.bucket,
          Key: key,
        })
      )
    )

    return res.pipe(
      bichain<Error, Error, boolean>(error => {
        if (error.name === 'NotFound') {
          return resolve(false)
        }

        return reject(error)
      })(() => resolve(true))
    )
  }

  function read(
    path: string,
    range?: { start: number; end: number }
  ): FutureInstance<Error, Readable> {
    const key = prefixedKey(path)
    const input: {
      Bucket: string
      Key: string
      Range?: string
    } = {
      Bucket: config.bucket,
      Key: key,
    }

    if (range) {
      input.Range = `bytes=${range.start}-${range.end}`
    }

    const res = attemptP<Error, GetObjectCommandOutput>(() =>
      s3.send(new GetObjectCommand(input))
    )

    return res.pipe(
      map(output => {
        return output.Body != null ? (output.Body as Readable) : new Readable()
      })
    )
  }

  function write(path: string, data: Readable): FutureInstance<Error, void> {
    const key = prefixedKey(path)
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: config.bucket,
        Key: key,
        Body: data,
      },
    })

    const res = attemptP<Error, CompleteMultipartUploadCommandOutput>(() =>
      upload.done()
    )

    return res.pipe(map(() => void 0))
  }

  function deleteObject(path: string): FutureInstance<Error, void> {
    const key = prefixedKey(path)
    return attemptP<Error, void>(() =>
      s3
        .send(
          new DeleteObjectCommand({
            Bucket: config.bucket,
            Key: key,
          })
        )
        .then(() => void 0)
    )
  }

  return {
    exists,
    read,
    write,
    delete: deleteObject,
  }
}
