import { GetObjectCommand, GetObjectCommandOutput, S3Client } from '@aws-sdk/client-s3'
import { attemptP, FutureInstance, map } from 'fluture'
import { Readable } from 'node:stream'

export interface StorageClient {
  read(path: string): FutureInstance<Error, Readable>
}

interface Config {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

export function createS3StorageClient(config: Config): StorageClient {
  const s3 = new S3Client({
    endpoint: config.endpoint,
    forcePathStyle: true,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  })

  function read(path: string): FutureInstance<Error, Readable> {
    return attemptP<Error, GetObjectCommandOutput>(() =>
      s3.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: path,
        })
      )
    ).pipe(
      map(output => {
        return output.Body != null ? (output.Body as Readable) : new Readable()
      })
    )
  }

  return { read }
}
