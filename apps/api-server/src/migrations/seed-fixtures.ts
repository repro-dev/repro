import { CODEC_VERSION, SourceEventView } from '@repro/domain'
import { toBinaryWireFormat } from '@repro/wire-formats'
import { promise } from 'fluture'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import { defaultEnv as env } from '~/config/env'
import { FixtureRecording, fixtureRecordings } from '~/fixtures/recordings'
import { encodeId } from '~/modules/database'
import { createPostgresDatabaseClient } from '~/modules/database/database-postgres'
import { Database } from '~/modules/database/types'
import { Storage } from '~/modules/storage'
import { createS3StorageClient } from '~/modules/storage-s3'

function encodeRecordingData(fixture: FixtureRecording): Buffer {
  const views = fixture.events.map(event => SourceEventView.encode(event))
  const binaryData = toBinaryWireFormat(views)
  return Buffer.from(
    gzipSync(
      new Uint8Array(
        binaryData.buffer,
        binaryData.byteOffset,
        binaryData.byteLength
      )
    )
  )
}

function bufferToReadable(buf: Buffer): Readable {
  return Readable.from(buf)
}

async function seedRecording(
  db: Database,
  storage: Storage,
  fixture: FixtureRecording,
  projectId: number,
  authorId: number
) {
  const row = await db
    .insertInto('recordings')
    .values({
      title: fixture.title,
      url: fixture.url,
      description: fixture.description,
      mode: fixture.mode,
      duration: fixture.duration,
      browserName: fixture.browserName,
      browserVersion: fixture.browserVersion,
      operatingSystem: fixture.operatingSystem,
      codecVersion: CODEC_VERSION,
    })
    .returning(['id'])
    .executeTakeFirstOrThrow()

  const recordingId = encodeId(row.id)
  const data = encodeRecordingData(fixture)
  const path = `${recordingId}/data`

  await promise(storage.write(path, bufferToReadable(data)))

  await db
    .insertInto('project_recordings')
    .values({
      projectId,
      recordingId: row.id,
      authorId,
    })
    .execute()

  console.log(`  Seeded recording: ${fixture.title} (${recordingId})`)
}

export async function seedFixtures(db: Database) {
  console.log('Seeding fixture recordings...')

  const storage = createS3StorageClient({
    endpoint: env.STORAGE_ENDPOINT,
    region: env.STORAGE_REGION,
    bucket: env.STORAGE_BUCKET,
    accessKeyId: env.STORAGE_ACCESS_KEY_ID,
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY,
  })

  const acmeAccount = await db
    .selectFrom('accounts')
    .select('id')
    .where('name', '=', 'Acme Corp')
    .executeTakeFirst()

  if (!acmeAccount) {
    console.log('  Skipping: Acme Corp account not found (run seed first)')
    return
  }

  const project = await db
    .selectFrom('projects')
    .select('id')
    .where('accountId', '=', acmeAccount.id)
    .where('name', '=', 'Default Project')
    .executeTakeFirst()

  if (!project) {
    console.log('  Skipping: Default Project not found')
    return
  }

  const member = await db
    .selectFrom('users')
    .select('id')
    .where('email', '=', 'member@acme.repro.test')
    .executeTakeFirst()

  if (!member) {
    console.log('  Skipping: member@acme.repro.test not found')
    return
  }

  for (const fixture of fixtureRecordings) {
    await seedRecording(db, storage, fixture, project.id, member.id)
  }

  console.log('Fixture recordings seeded.')
}

async function main() {
  const db = createPostgresDatabaseClient({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    ssl: env.DB_SSL,
  })

  try {
    await seedFixtures(db)
  } catch (error) {
    console.error('Fixture seeding failed:', error)
    process.exit(1)
  } finally {
    await db.destroy()
  }
}

if (process.argv[1] === import.meta.filename) {
  main()
}
