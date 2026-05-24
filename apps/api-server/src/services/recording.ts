import { CODEC_VERSION, RecordingInfo, RecordingMode } from '@repro/domain'
import {
  FutureInstance,
  bichain,
  chain,
  go,
  map,
  parallel,
  reject,
  resolve,
} from 'fluture'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'
import {
  Database,
  attemptQuery,
  decodeId,
  withEncodedId,
} from '~/modules/database'
import { ApiLogger, noopLogger } from '~/modules/logger'
import { Storage } from '~/modules/storage'
import {
  badRequest,
  isNotFound,
  notFound,
  permissionDenied,
  resourceConflict,
} from '~/utils/errors'

export function createRecordingService(
  database: Database,
  storage: Storage,
  logger: ApiLogger = noopLogger
) {
  function ensureIsPublicRecording(
    recordingId: string
  ): FutureInstance<Error, void> {
    return attemptQuery(() => {
      return database
        .selectFrom('project_recordings')
        .select('projectId')
        .where('recordingId', '=', decodeId(recordingId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(
      bichain<Error, Error, void>(error => {
        return isNotFound(error) ? resolve(undefined) : reject(error)
      })(() => {
        return reject(permissionDenied())
      })
    )
  }

  function readDataAsStream(
    recordingId: string
  ): FutureInstance<Error, Readable> {
    const path = `${recordingId}/data`
    return storage
      .exists(path)
      .pipe(
        chain(exists =>
          exists
            ? storage.read(path)
            : reject(notFound('Recording data not found'))
        )
      )
  }

  function writeDataFromStream(
    recordingId: string,
    data: Readable
  ): FutureInstance<Error, void> {
    return readInfo(recordingId).pipe(
      chain(() => {
        return storage.exists(`${recordingId}/data`).pipe(
          chain(exists => {
            return exists
              ? reject(
                  resourceConflict(
                    `Data for recording "${recordingId}" already exists`
                  )
                )
              : storage.write(`${recordingId}/data`, data.pipe(createGunzip()))
          })
        )
      })
    )
  }

  function readResourceAsStream(
    recordingId: string,
    resourceId: string
  ): FutureInstance<Error, Readable> {
    return storage.read(`${recordingId}/resources/${resourceId}`)
  }

  function writeResourceFromStream(
    recordingId: string,
    resourceId: string,
    data: Readable
  ): FutureInstance<Error, void> {
    return readInfo(recordingId).pipe(
      chain(() => {
        return storage.exists(`${recordingId}/resources/${resourceId}`).pipe(
          chain(exists => {
            return exists
              ? reject(
                  resourceConflict(
                    `Resource "${resourceId}" for recording "${recordingId}" already exists`
                  )
                )
              : storage.write(`${recordingId}/resources/${resourceId}`, data)
          })
        )
      })
    )
  }

  function readResourceMap(
    recordingId: string
  ): FutureInstance<Error, Record<string, string>> {
    return readInfo(recordingId).pipe(
      chain(() => {
        return attemptQuery(() =>
          database
            .selectFrom('recording_resources')
            .where('recordingId', '=', decodeId(recordingId))
            .select(['key', 'value'])
            .execute()
        ).pipe(
          map(rows => Object.fromEntries(rows.map(row => [row.key, row.value])))
        )
      })
    )
  }

  function writeResourceMap(
    recordingId: string,
    resourceMap: Record<string, string>
  ): FutureInstance<Error, void> {
    const decodedRecordingId = decodeId(recordingId)

    if (decodedRecordingId == null) {
      return reject(badRequest(`Invalid recording ID "${recordingId}"`))
    }

    return go(function* () {
      yield readInfo(recordingId)

      const rows = Object.entries(resourceMap).map(([key, value]) => ({
        key,
        value,
        recordingId: decodedRecordingId,
      }))

      if (!rows.length) {
        return yield resolve(undefined)
      }

      return yield attemptQuery(() =>
        database.insertInto('recording_resources').values(rows).execute()
      ).pipe(map(() => undefined))
    })
  }

  function listInfo(
    offset = 0,
    limit = 50
  ): FutureInstance<Error, Array<RecordingInfo>> {
    return attemptQuery(() => {
      return database
        .selectFrom('recordings')
        .selectAll()
        .offset(offset)
        .limit(limit)
        .execute()
    }).pipe(
      map(rows =>
        rows.map(row => ({
          ...withEncodedId(row),
          createdAt: row.createdAt.toISOString(),
        }))
      )
    )
  }

  function readInfo(recordingId: string): FutureInstance<Error, RecordingInfo> {
    return attemptQuery(() => {
      return database
        .selectFrom('recordings')
        .selectAll()
        .where('id', '=', decodeId(recordingId))
        .executeTakeFirstOrThrow(() => notFound())
    }).pipe(
      map(row => ({
        ...withEncodedId(row),
        createdAt: row.createdAt.toISOString(),
      }))
    )
  }

  function readInfoMany(
    recordingIds: Array<string>,
    offset = 0,
    limit = 50
  ): FutureInstance<Error, Array<RecordingInfo>> {
    return attemptQuery(() => {
      return database
        .selectFrom('recordings')
        .selectAll()
        .where('id', 'in', recordingIds.map(decodeId))
        .offset(offset)
        .limit(limit)
        .execute()
    }).pipe(
      map(rows =>
        rows.map(row => ({
          ...withEncodedId(row),
          createdAt: row.createdAt.toISOString(),
        }))
      )
    )
  }

  function writeInfo(
    title: string,
    url: string,
    description: string,
    mode: RecordingMode,
    duration: number,
    browserName: string | null,
    browserVersion: string | null,
    operatingSystem: string | null
  ): FutureInstance<Error, RecordingInfo> {
    return attemptQuery(() => {
      return database
        .insertInto('recordings')
        .values({
          title,
          url,
          description,
          mode,
          duration,
          browserName,
          browserVersion,
          operatingSystem,
          codecVersion: CODEC_VERSION,
        })
        .returningAll()
        .executeTakeFirstOrThrow()
    }).pipe(
      map(row => ({
        ...withEncodedId(row),
        createdAt: row.createdAt.toISOString(),
      }))
    )
  }

  function writeEventIndex(
    recordingId: string,
    entries: Array<{
      eventIndex: number
      eventType: number
      timeMs: number
      byteOffset: number
      byteLength: number
    }>
  ): FutureInstance<Error, void> {
    const decodedRecordingId = decodeId(recordingId)

    if (decodedRecordingId == null) {
      return reject(badRequest(`Invalid recording ID "${recordingId}"`))
    }

    return go(function* () {
      yield readInfo(recordingId)

      if (!entries.length) {
        return yield resolve(undefined)
      }

      return yield attemptQuery(() =>
        database
          .insertInto('recording_event_index')
          .values(entries.map(e => ({ ...e, recordingId: decodedRecordingId })))
          .execute()
      ).pipe(map(() => undefined))
    })
  }

  function deleteRecording(
    projectId: string,
    recordingId: string
  ): FutureInstance<Error, void> {
    const decodedProjectId = decodeId(projectId)
    const decodedRecordingId = decodeId(recordingId)

    if (decodedProjectId == null) {
      return reject(badRequest(`Invalid project ID "${projectId}"`))
    }

    if (decodedRecordingId == null) {
      return reject(badRequest(`Invalid recording ID "${recordingId}"`))
    }

    return go(function* () {
      // Verify the recording exists in this project (throws 404 if not)
      yield readInfo(recordingId)

      const projectRecordingRow: { recordingId: number } | undefined =
        yield attemptQuery(() =>
          database
            .selectFrom('project_recordings')
            .select('recordingId')
            .where('projectId', '=', decodedProjectId)
            .where('recordingId', '=', decodedRecordingId)
            .executeTakeFirst()
        )

      if (projectRecordingRow == null) {
        return yield reject(notFound())
      }

      // Collect resource blob paths before deleting DB rows
      const resourceRows: Array<{ value: string }> = yield attemptQuery(() =>
        database
          .selectFrom('recording_resources')
          .select('value')
          .where('recordingId', '=', decodedRecordingId)
          .execute()
      )

      // Delete DB rows atomically; order respects FK constraints:
      //   recording_event_index → recordings
      //   recording_resources   → recordings
      //   project_recordings    → recordings
      yield attemptQuery(() =>
        database.transaction().execute(async trx => {
          await trx
            .deleteFrom('recording_event_index')
            .where('recordingId', '=', decodedRecordingId)
            .execute()

          await trx
            .deleteFrom('recording_resources')
            .where('recordingId', '=', decodedRecordingId)
            .execute()

          await trx
            .deleteFrom('project_recordings')
            .where('recordingId', '=', decodedRecordingId)
            .execute()

          await trx
            .deleteFrom('recordings')
            .where('id', '=', decodedRecordingId)
            .execute()
        })
      )

      // Best-effort storage cleanup — absorb errors per-blob so a single
      // failure does not cancel sibling deletes or reject the outer Future.
      const bestEffort = (
        fut: FutureInstance<Error, void>,
        blobKey: string
      ): FutureInstance<never, void> =>
        fut.pipe(
          bichain<Error, never, void>(error => {
            logger.warn(
              {
                err: error,
                event: 'recording.storage_cleanup_failed',
                recordingId,
                blobKey,
              },
              'Recording storage cleanup failed'
            )
            return resolve(undefined)
          })(resolve)
        )

      const storageFutures: Array<FutureInstance<never, void>> = [
        bestEffort(
          storage.delete(`${recordingId}/data`),
          `${recordingId}/data`
        ),
        ...resourceRows.map(row =>
          bestEffort(
            storage.delete(`${recordingId}/resources/${row.value}`),
            `${recordingId}/resources/${row.value}`
          )
        ),
      ]

      return yield parallel(Infinity)(storageFutures)
    })
  }

  return {
    // Access control
    ensureIsPublicRecording,

    // Queries
    readDataAsStream,
    readResourceAsStream,
    readResourceMap,
    listInfo,
    readInfo,
    readInfoMany,

    // Mutations
    writeDataFromStream,
    writeResourceFromStream,
    writeResourceMap,
    writeEventIndex,
    writeInfo,
    deleteRecording,
  }
}

export type RecordingService = ReturnType<typeof createRecordingService>
