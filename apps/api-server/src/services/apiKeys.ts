import { FutureInstance, chain, map, resolve } from 'fluture'
import { createHash, randomBytes } from 'node:crypto'
import { Database, attemptQuery, decodeId, encodeId } from '~/modules/database'

// Full plaintext key format: repro_<base64url(32 bytes)>
// Key prefix: first 8 chars of the random portion (after repro_)
// Key hash: SHA-256 of the full key for secure DB storage

const KEY_PREFIX_TOKEN = 'repro_'
const KEY_PREFIX_LENGTH = 8

function generateKey(): { key: string; prefix: string; hash: string } {
  const random = randomBytes(32).toString('base64url')
  const key = KEY_PREFIX_TOKEN + random
  const prefix = random.slice(0, KEY_PREFIX_LENGTH)
  const hash = createHash('sha256').update(key).digest('hex')
  return { key, prefix, hash }
}

export interface ApiKeyRecord {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: Date | null
  expiresAt: Date | null
  revokedAt: Date | null
  createdAt: Date
}

export interface CreateApiKeyParams {
  userId: number
  accountId: number
  name: string
  scopes: string[]
  expiresAt?: Date
}

export interface ValidateApiKeyResult {
  userId: string
  accountId: string
  scopes: string[]
}

export function createApiKeyService(database: Database) {
  function createApiKey(
    params: CreateApiKeyParams
  ): FutureInstance<Error, { id: string; key: string; prefix: string }> {
    const { key, prefix, hash } = generateKey()

    return attemptQuery(() =>
      database
        .insertInto('api_keys')
        .values({
          userId: params.userId,
          accountId: params.accountId,
          name: params.name,
          scopes: params.scopes,
          keyPrefix: prefix,
          keyHash: hash,
          // Legacy token field — store the prefix as a non-secret identifier
          token: prefix,
          lastUsedAt: null,
          revokedAt: null,
          ...(params.expiresAt != null ? { expiresAt: params.expiresAt } : {}),
        })
        .returning(['id'])
        .executeTakeFirstOrThrow()
    ).pipe(
      map(row => ({
        id: encodeId(row.id),
        key,
        prefix,
      }))
    )
  }

  function listApiKeys(
    userId: number
  ): FutureInstance<Error, Array<ApiKeyRecord>> {
    return attemptQuery(() =>
      database
        .selectFrom('api_keys')
        .select([
          'id',
          'name',
          'keyPrefix',
          'scopes',
          'lastUsedAt',
          'expiresAt',
          'revokedAt',
          'createdAt',
        ])
        .where('userId', '=', userId)
        .orderBy('createdAt', 'desc')
        .execute()
    ).pipe(
      map(rows =>
        rows.map(row => ({
          id: encodeId(row.id),
          name: row.name,
          // For legacy keys (pre-migration), keyPrefix may be null
          keyPrefix: row.keyPrefix ?? '',
          scopes: row.scopes,
          lastUsedAt: row.lastUsedAt,
          expiresAt: row.expiresAt,
          revokedAt: row.revokedAt,
          createdAt: row.createdAt,
        }))
      )
    )
  }

  function revokeApiKey(params: {
    keyId: string
    userId: number
  }): FutureInstance<Error, void> {
    const intId = decodeId(params.keyId)

    if (intId == null) {
      return resolve(undefined)
    }

    return attemptQuery(() =>
      database
        .updateTable('api_keys')
        .set({ revokedAt: new Date() })
        .where('id', '=', intId)
        .where('userId', '=', params.userId)
        .execute()
    ).pipe(map(() => undefined))
  }

  function validateApiKey(
    rawKey: string
  ): FutureInstance<Error, ValidateApiKeyResult | null> {
    const hash = createHash('sha256').update(rawKey).digest('hex')
    const now = new Date()

    return attemptQuery(() =>
      database
        .selectFrom('api_keys')
        .select([
          'id',
          'userId',
          'accountId',
          'scopes',
          'expiresAt',
          'revokedAt',
        ])
        .where('keyHash', '=', hash)
        .executeTakeFirst()
    ).pipe(
      chain(row => {
        if (!row) {
          return resolve(null)
        }

        if (row.revokedAt !== null) {
          return resolve(null)
        }

        if (row.expiresAt !== null && row.expiresAt < now) {
          return resolve(null)
        }

        // Fire-and-forget: update lastUsedAt (best-effort, ignore failures)
        database
          .updateTable('api_keys')
          .set({ lastUsedAt: now })
          .where('id', '=', row.id)
          .execute()
          .catch(() => undefined)

        return resolve({
          userId: encodeId(row.userId),
          accountId: row.accountId != null ? encodeId(row.accountId) : '',
          scopes: row.scopes,
        })
      })
    )
  }

  return {
    createApiKey,
    listApiKeys,
    revokeApiKey,
    validateApiKey,
  }
}

export type ApiKeyService = ReturnType<typeof createApiKeyService>
