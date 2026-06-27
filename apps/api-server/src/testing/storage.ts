import { S3Client } from '@aws-sdk/client-s3'
import { mockClient } from 'aws-sdk-client-mock'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createFileSystemStorageClient } from '~/modules/storage-fs'
import { createS3StorageClient } from '~/modules/storage-s3'

export async function setUpTestFileSystemStorage(
  overrides: Partial<{
    path: string
    keyPrefix: string
  }> = {}
) {
  const dirPath =
    overrides.path ?? (await mkdtemp(path.join(tmpdir(), 'repro-test-')))

  return {
    storage: createFileSystemStorageClient({
      path: dirPath,
      keyPrefix: overrides.keyPrefix,
    }),
    close: async () => {
      await rm(dirPath, { force: true, recursive: true })
    },
  }
}

export async function setUpTestS3Storage(
  overrides: Partial<{
    endpoint: string
    region: string
    bucket: string
    accessKeyId: string
    secretAccessKey: string
    keyPrefix: string
  }> = {}
) {
  const s3Mock = mockClient(S3Client)

  return {
    storage: createS3StorageClient({
      endpoint: overrides.endpoint ?? 'http://repro-test-endpoint',
      region: overrides.region ?? 'repro-test-region',
      bucket: overrides.bucket ?? 'repro-test-bucket',
      accessKeyId: overrides.accessKeyId ?? '',
      secretAccessKey: overrides.secretAccessKey ?? '',
      keyPrefix: overrides.keyPrefix,
    }),

    s3Mock,

    close: async () => {
      s3Mock.restore()
    },
  }
}
