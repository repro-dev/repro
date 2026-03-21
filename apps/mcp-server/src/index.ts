import { RecordingDataAccessor } from '@repro/agentic'
import { RecordingInfo, RecordingMode } from '@repro/domain'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import Fastify from 'fastify'
import { attemptP, chain, FutureInstance, map, reject } from 'fluture'
import { defaultEnv } from '~/config/env'
import { createPostgresDatabaseClient } from '~/modules/database'
import { decodeId, encodeId } from '~/modules/ids'
import { createS3StorageClient } from '~/modules/storage'
import { loadRecordingData } from '~/recording/loadRecordingData'
import { ServerRecordingDataAccessor } from '~/recording/ServerRecordingDataAccessor'
import { createTokenValidator } from '~/auth/validateToken'
import { registerTools } from '~/tools/registry'
import mcpHandler from '~/transport/mcp-handler'
import { Selectable } from 'kysely'
import { RecordingTable } from '~/modules/schema'

const fastify = Fastify({ logger: true })

const db = createPostgresDatabaseClient({
  host: defaultEnv.DB_HOST,
  port: defaultEnv.DB_PORT,
  database: defaultEnv.DB_NAME,
  user: defaultEnv.DB_USER,
  password: defaultEnv.DB_PASSWORD,
  ssl: defaultEnv.DB_SSL,
})

const storage = createS3StorageClient({
  endpoint: defaultEnv.STORAGE_ENDPOINT,
  region: defaultEnv.STORAGE_REGION,
  bucket: defaultEnv.STORAGE_BUCKET,
  accessKeyId: defaultEnv.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: defaultEnv.STORAGE_SECRET_ACCESS_KEY,
})

const validateToken = createTokenValidator(db)

const mcpServer = new McpServer({ name: 'repro-mcp', version: '1.0.0' })

registerTools(
  mcpServer,
  (recordingId): FutureInstance<Error, RecordingDataAccessor> => {
    const numericId = decodeId(recordingId)

    if (numericId === null) {
      return reject(new Error('Invalid recording ID'))
    }

    const fetchRow: FutureInstance<Error, Selectable<RecordingTable> | undefined> = attemptP(
      () =>
        db
          .selectFrom('recordings')
          .selectAll()
          .where('id', '=', numericId)
          .executeTakeFirst()
    )

    return fetchRow.pipe(
      chain(row => {
        if (!row) {
          return reject<Error>(new Error('Recording not found')) as FutureInstance<Error, RecordingDataAccessor>
        }

        const recordingInfo: RecordingInfo = {
          id: encodeId(row.id),
          title: row.title,
          url: row.url,
          description: row.description ?? '',
          mode: row.mode as RecordingMode,
          duration: row.duration,
          createdAt: row.createdAt.toISOString(),
          browserName: row.browserName ?? null,
          browserVersion: row.browserVersion ?? null,
          operatingSystem: row.operatingSystem ?? null,
          codecVersion: row.codecVersion,
        }

        return loadRecordingData(storage, recordingId).pipe(
          map(
            events =>
              new ServerRecordingDataAccessor(
                recordingInfo,
                events
              ) as RecordingDataAccessor
          )
        )
      })
    )
  }
)

fastify.register(mcpHandler, { mcpServer, validateToken })

fastify.listen({ host: defaultEnv.HOST, port: defaultEnv.PORT })
