import { S3Client } from '@aws-sdk/client-s3'
import { mockClient } from 'aws-sdk-client-mock'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createFileSystemStorageClient } from '~/modules/storage-fs'
import { createS3StorageClient } from '~/modules/storage-s3'

export async function setUpTestFileSystemStorage() {
  const dirPath = await mkdtemp(path.join(tmpdir(), 'repro-test-'))

  return {
    storage: createFileSystemStorageClient({
      path: dirPath,
    }),
    close: async () => {
      await rm(dirPath, { force: true, recursive: true })
    },
  }
}

export async function setUpTestS3Storage() {
  const s3Mock = mockClient(S3Client)

  return {
    storage: createS3StorageClient({
      endpoint: 'http://repro-test-endpoint',
      region: 'repro-test-region',
      bucket: 'repro-test-bucket',
      accessKeyId: '',
      secretAccessKey: '',
    }),

    s3Mock,

    close: async () => {
      s3Mock.restore()
    },
  }
}
