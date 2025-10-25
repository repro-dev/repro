import { CODEC_VERSION, RecordingInfo, RecordingMode } from '@repro/domain'
import {
  FutureInstance,
  bichain,
  chain,
  go,
  map,
  reject,
  resolve,
} from 'fluture'
import { Readable } from 'node:stream'
import {
  Database,
  attemptQuery,
  decodeId,
  withEncodedId,
} from '~/modules/database'
import { Storage } from '~/modules/storage'
import {
  badRequest,
  isNotFound,
  notFound,
  permissionDenied,
  resourceConflict,
} from '~/utils/errors'

export function createRecordingService(database: Database, storage: Storage) {
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
              : storage.write(`${recordingId}/data`, data)
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
    writeInfo,
  }
}

export type RecordingService = ReturnType<typeof createRecordingService>
