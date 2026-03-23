import { FutureInstance, chain, map, reject, resolve } from 'fluture'
import { createHash, randomBytes } from 'node:crypto'
import { Database, attemptQuery, encodeId } from '~/modules/database'
import { notAuthenticated, notFound } from '~/utils/errors'

export interface OAuthClient {
  id: string
  clientId: string
  clientSecret: string | null
  name: string
  redirectUris: string[]
  userId: string
}

export interface ApiKey {
  id: number
  token: string
  name: string
  userId: number
  scopes: string[]
  lastUsedAt: Date | null
  createdAt: Date
  revokedAt: Date | null
}

export function createOAuthService(database: Database) {
  function registerClient(
    userId: number,
    name: string,
    redirectUris: string[]
  ): FutureInstance<Error, OAuthClient> {
    const clientId = randomBytes(32).toString('hex')
    const clientSecret = randomBytes(32).toString('hex')

    return attemptQuery(() =>
      database
        .insertInto('oauth_clients')
        .values({
          clientId,
          clientSecret,
          name,
          redirectUris,
          userId,
        })
        .returning(['id', 'clientId', 'clientSecret', 'name', 'redirectUris', 'userId'])
        .executeTakeFirstOrThrow()
    ).pipe(
      map(row => ({
        id: encodeId(row.id),
        clientId: row.clientId,
        clientSecret: row.clientSecret,
        name: row.name,
        redirectUris: row.redirectUris,
        userId: encodeId(row.userId),
      }))
    )
  }

  function createAuthorizationCode(
    clientId: string,
    userId: number,
    redirectUri: string,
    codeChallenge: string,
    codeChallengeMethod: string,
    scopes: string[]
  ): FutureInstance<Error, string> {
    const code = randomBytes(64).toString('hex')
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)

    return attemptQuery(() =>
      database
        .insertInto('oauth_authorization_codes')
        .values({
          code,
          clientId,
          userId,
          redirectUri,
          codeChallenge,
          codeChallengeMethod,
          scopes,
          expiresAt,
        })
        .execute()
    ).pipe(map(() => code))
  }

  function exchangeCode(
    code: string,
    codeVerifier: string,
    clientId: string,
    redirectUri: string
  ): FutureInstance<Error, ApiKey> {
    const now = new Date()
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')

    return attemptQuery(() =>
      database
        .updateTable('oauth_authorization_codes')
        .set({ used: true })
        .where('code', '=', code)
        .where('used', '=', false)
        .where('expiresAt', '>', now)
        .where('clientId', '=', clientId)
        .where('redirectUri', '=', redirectUri)
        .where('codeChallenge', '=', codeChallenge)
        .where('codeChallengeMethod', '=', 'S256')
        .returning(['userId', 'clientId', 'scopes'])
        .executeTakeFirst()
    ).pipe(
      chain(row => {
        if (!row) {
          return reject(notAuthenticated())
        }
        return createApiKey(row.userId, `OAuth exchange for client ${row.clientId}`, row.scopes)
      })
    )
  }

  function createApiKey(
    userId: number,
    name: string,
    scopes: string[]
  ): FutureInstance<Error, ApiKey> {
    const token = randomBytes(32).toString('hex')

    return attemptQuery(() =>
      database
        .insertInto('api_keys')
        .values({
          token,
          name,
          userId,
          scopes,
          lastUsedAt: null,
          revokedAt: null,
        })
        .returning([
          'id',
          'token',
          'name',
          'userId',
          'scopes',
          'lastUsedAt',
          'createdAt',
          'revokedAt',
        ])
        .executeTakeFirstOrThrow()
    )
  }

  function validateApiKey(token: string): FutureInstance<Error, ApiKey> {
    return attemptQuery(() =>
      database
        .selectFrom('api_keys')
        .selectAll()
        .where('token', '=', token)
        .executeTakeFirst()
    ).pipe(
      chain(row => {
        if (!row) {
          return reject(notFound())
        }
        if (row.revokedAt !== null) {
          return reject(notAuthenticated())
        }
        return resolve(row as ApiKey)
      })
    )
  }

  function revokeApiKey(id: number, userId: number): FutureInstance<Error, void> {
    return attemptQuery(() =>
      database
        .updateTable('api_keys')
        .set({ revokedAt: new Date() })
        .where('id', '=', id)
        .where('userId', '=', userId)
        .execute()
    ).pipe(map(() => undefined))
  }

  function listApiKeys(userId: number): FutureInstance<Error, Array<ApiKey>> {
    return attemptQuery(() =>
      database
        .selectFrom('api_keys')
        .selectAll()
        .where('userId', '=', userId)
        .execute()
    ) as FutureInstance<Error, Array<ApiKey>>
  }

  return {
    registerClient,
    createAuthorizationCode,
    exchangeCode,
    createApiKey,
    validateApiKey,
    revokeApiKey,
    listApiKeys,
  }
}

export type OAuthService = ReturnType<typeof createOAuthService>
