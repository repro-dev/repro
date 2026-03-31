import { FutureInstance, chain, reject, resolve } from 'fluture'
import { Database, attemptQuery } from '~/modules/database'
import { OAuthProvider } from '~/modules/database/schema/OAuthConnectionTable'
import { notFound } from '~/utils/errors'

export interface OAuthConnection {
  id: number
  userId: number
  provider: OAuthProvider
  providerAccountId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  createdAt: Date
}

export interface UpsertConnectionParams {
  userId: number
  provider: OAuthProvider
  providerAccountId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
}

export function createSocialAuthService(database: Database) {
  function upsertConnection(
    params: UpsertConnectionParams
  ): FutureInstance<Error, OAuthConnection> {
    return attemptQuery(() =>
      database
        .insertInto('oauth_connections')
        .values({
          userId: params.userId,
          provider: params.provider,
          providerAccountId: params.providerAccountId,
          accessToken: params.accessToken,
          refreshToken: params.refreshToken ?? null,
          expiresAt: params.expiresAt ?? null,
        })
        .onConflict(cb =>
          cb.columns(['provider', 'providerAccountId']).doUpdateSet({
            accessToken: params.accessToken,
            refreshToken: params.refreshToken ?? null,
            expiresAt: params.expiresAt ?? null,
          })
        )
        .returning([
          'id',
          'userId',
          'provider',
          'providerAccountId',
          'accessToken',
          'refreshToken',
          'expiresAt',
          'createdAt',
        ])
        .executeTakeFirstOrThrow()
    )
  }

  function getConnectionByProviderAccountId(
    provider: OAuthProvider,
    providerAccountId: string
  ): FutureInstance<Error, OAuthConnection> {
    return attemptQuery(() =>
      database
        .selectFrom('oauth_connections')
        .selectAll()
        .where('provider', '=', provider)
        .where('providerAccountId', '=', providerAccountId)
        .executeTakeFirst()
    ).pipe(
      chain(row => (row ? resolve(row as OAuthConnection) : reject(notFound())))
    )
  }

  return {
    upsertConnection,
    getConnectionByProviderAccountId,
  }
}

export type SocialAuthService = ReturnType<typeof createSocialAuthService>
