import { ShareTokenInfo } from '@repro/domain'
import { FutureInstance, chain, go, map, reject, resolve } from 'fluture'
import { randomBytes } from 'node:crypto'
import {
  Database,
  attemptQuery,
  decodeId,
  encodeId,
  withEncodedId,
} from '~/modules/database'
import { badRequest, notFound } from '~/utils/errors'

export function createShareService(
  database: Database,
  reproAppUrl = 'http://localhost:3000'
) {
  function toShareTokenInfo(row: {
    id: number
    token: string
    resourceType: string
    resourceId: number
    createdBy: number
    createdAt: Date
    expiresAt: Date | null
    revokedAt: Date | null
  }): ShareTokenInfo {
    return {
      ...withEncodedId(row),
      resourceId: encodeId(row.resourceId),
      createdBy: encodeId(row.createdBy),
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      shareUrl: `${reproAppUrl}/share/${row.token}`,
    }
  }

  function generateToken(): FutureInstance<Error, string> {
    return resolve(randomBytes(32).toString('hex'))
  }

  function createShareToken(
    resourceType: string,
    resourceId: string,
    createdBy: string,
    expiresAt: string | null
  ): FutureInstance<Error, ShareTokenInfo> {
    const decodedResourceId = decodeId(resourceId)
    const decodedCreatedBy = decodeId(createdBy)

    if (decodedResourceId == null) {
      return reject(badRequest(`Invalid resource ID "${resourceId}"`))
    }

    if (decodedCreatedBy == null) {
      return reject(badRequest(`Invalid user ID "${createdBy}"`))
    }

    return go(function* () {
      const token: string = yield generateToken()

      const row = yield attemptQuery(() => {
        return database
          .insertInto('share_tokens')
          .values({
            token,
            resourceType,
            resourceId: decodedResourceId,
            createdBy: decodedCreatedBy,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
          })
          .returningAll()
          .executeTakeFirstOrThrow()
      })

      return toShareTokenInfo(row)
    })
  }

  function resolveShareToken(
    token: string
  ): FutureInstance<Error, ShareTokenInfo> {
    return attemptQuery(() => {
      return database
        .selectFrom('share_tokens')
        .selectAll()
        .where('token', '=', token)
        .executeTakeFirstOrThrow(() => notFound('Share token not found'))
    }).pipe(
      chain(row => {
        if (row.revokedAt != null) {
          return reject(notFound('Share token has been revoked'))
        }

        if (row.expiresAt != null && row.expiresAt < new Date()) {
          return reject(notFound('Share token has expired'))
        }

        return resolve(toShareTokenInfo(row))
      })
    )
  }

  function revokeShareToken(
    tokenId: string,
    userId: string
  ): FutureInstance<Error, void> {
    const decodedTokenId = decodeId(tokenId)
    const decodedUserId = decodeId(userId)

    if (decodedTokenId == null) {
      return reject(badRequest(`Invalid token ID "${tokenId}"`))
    }

    if (decodedUserId == null) {
      return reject(badRequest(`Invalid user ID "${userId}"`))
    }

    return attemptQuery(() => {
      return database
        .updateTable('share_tokens')
        .set({ revokedAt: new Date() })
        .where('id', '=', decodedTokenId)
        .where('createdBy', '=', decodedUserId)
        .where('revokedAt', 'is', null)
        .executeTakeFirst()
    }).pipe(
      map(result => {
        if (result.numUpdatedRows === 0n) {
          throw notFound()
        }
      })
    )
  }

  function listShareTokens(
    resourceType: string,
    resourceId: string
  ): FutureInstance<Error, Array<ShareTokenInfo>> {
    const decodedResourceId = decodeId(resourceId)

    if (decodedResourceId == null) {
      return reject(badRequest(`Invalid resource ID "${resourceId}"`))
    }

    return attemptQuery(() => {
      return database
        .selectFrom('share_tokens')
        .selectAll()
        .where('resourceType', '=', resourceType)
        .where('resourceId', '=', decodedResourceId)
        .orderBy('createdAt', 'desc')
        .execute()
    }).pipe(map(rows => rows.map(row => toShareTokenInfo(row))))
  }

  return {
    createShareToken,
    resolveShareToken,
    revokeShareToken,
    listShareTokens,
  }
}

export type ShareService = ReturnType<typeof createShareService>
