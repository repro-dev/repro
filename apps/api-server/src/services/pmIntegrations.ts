import { PmOAuthProviders, PmProvider } from '@repro/domain'
import {
  type FutureInstance,
  attemptP,
  chain,
  map,
  mapRej,
  reject,
  resolve,
} from 'fluture'
import { sql } from 'kysely'
import { attemptQuery, Database } from '~/modules/database'
import { notFound, serviceUnavailable } from '~/utils/errors'

export interface PmConnectionRow {
  id: number
  accountId: number
  provider: PmProvider
  providerWorkspaceId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  scopes: string[]
  status: string
  createdAt: Date
  updatedAt: Date
}

export interface UpsertConnectionParams {
  accountId: number
  provider: PmProvider
  providerWorkspaceId: string
  accessToken: string
  refreshToken: string | null
  expiresAt: Date | null
  scopes: string[]
  status: string
}

/** 60-second skew buffer: treat tokens within 60s of expiry as stale. */
const TOKEN_SKEW_MS = 60_000

function tokenIsFresh(expiresAt: Date | null): boolean {
  if (expiresAt == null) {
    // No expiry information — assume fresh (skip refresh)
    return true
  }
  return expiresAt.getTime() > Date.now() + TOKEN_SKEW_MS
}

export function createPmIntegrationService(
  database: Database,
  providers: PmOAuthProviders = {}
) {
  // In-memory single-flight guard keyed by `${accountId}:${provider}`.
  // Ensures concurrent consumers sharing the same connection do not
  // double-refresh.  This guard is per-process only — multi-instance
  // deployments should replace it with a distributed lock (Redis or
  // DB advisory lock).
  const singleFlightMap = new Map<
    string,
    FutureInstance<Error, PmConnectionRow>
  >()

  function upsertConnection(
    params: UpsertConnectionParams
  ): FutureInstance<Error, PmConnectionRow> {
    return attemptQuery(() =>
      database
        .insertInto('pm_connections')
        .values({
          accountId: params.accountId,
          provider: params.provider,
          providerWorkspaceId: params.providerWorkspaceId,
          accessToken: params.accessToken,
          refreshToken: params.refreshToken ?? null,
          expiresAt: params.expiresAt ?? null,
          scopes: params.scopes,
          status: params.status,
        })
        .onConflict(cb =>
          cb.columns(['accountId', 'provider']).doUpdateSet({
            providerWorkspaceId: params.providerWorkspaceId,
            accessToken: params.accessToken,
            refreshToken: params.refreshToken ?? null,
            expiresAt: params.expiresAt ?? null,
            scopes: params.scopes,
            status: params.status,
            updatedAt: sql`NOW()`,
          })
        )
        .returning([
          'id',
          'accountId',
          'provider',
          'providerWorkspaceId',
          'accessToken',
          'refreshToken',
          'expiresAt',
          'scopes',
          'status',
          'createdAt',
          'updatedAt',
        ])
        .executeTakeFirstOrThrow()
    )
  }

  function getConnection(
    accountId: number,
    provider: PmProvider
  ): FutureInstance<Error, PmConnectionRow> {
    return attemptQuery(() =>
      database
        .selectFrom('pm_connections')
        .selectAll()
        .where('accountId', '=', accountId)
        .where('provider', '=', provider)
        .executeTakeFirst()
    ).pipe(
      chain(row => (row ? resolve(row as PmConnectionRow) : reject(notFound())))
    )
  }

  function disconnectConnection(
    accountId: number,
    provider: PmProvider
  ): FutureInstance<Error, PmConnectionRow | undefined> {
    return attemptQuery(() =>
      database
        .updateTable('pm_connections')
        .set({
          status: 'disconnected',
          accessToken: '',
          refreshToken: '',
          updatedAt: sql`NOW()`,
        })
        .where('accountId', '=', accountId)
        .where('provider', '=', provider)
        .where('status', '=', 'connected')
        .returning([
          'id',
          'accountId',
          'provider',
          'providerWorkspaceId',
          'accessToken',
          'refreshToken',
          'expiresAt',
          'scopes',
          'status',
          'createdAt',
          'updatedAt',
        ])
        .executeTakeFirst()
    )
  }

  function listConnections(
    accountId: number
  ): FutureInstance<Error, PmConnectionRow[]> {
    return attemptQuery(() =>
      database
        .selectFrom('pm_connections')
        .selectAll()
        .where('accountId', '=', accountId)
        .execute()
    ).pipe(map(rows => rows as PmConnectionRow[]))
  }

  /**
   * Internal: refresh a connection's tokens via the OAuth provider and
   * atomically persist the updated token set (access token, refresh token,
   * and expiresAt).  On failure, update the connection status to
   * `needs_reauth` and reject with a non-secret error (token values
   * are never exposed in errors or logs).
   */
  function refreshAndPersistToken(
    connection: PmConnectionRow
  ): FutureInstance<Error, PmConnectionRow> {
    const oauthProvider = providers[connection.provider]

    if (oauthProvider == null) {
      return reject(
        serviceUnavailable(
          `Token refresh failed: provider "${connection.provider}" is not configured`
        )
      )
    }

    if (connection.refreshToken == null) {
      // No refresh token available and the current token is stale — mark as
      // needs_reauth and reject.
      return attemptQuery(() =>
        database
          .updateTable('pm_connections')
          .set({
            status: 'needs_reauth',
            updatedAt: sql`NOW()`,
          })
          .where('accountId', '=', connection.accountId)
          .where('provider', '=', connection.provider)
          .execute()
      ).pipe(
        chain(() =>
          reject(
            serviceUnavailable(
              'Token refresh failed; re-authorization required'
            )
          )
        )
      )
    }

    // Wrap the entire refresh+persist cycle in a single attemptP to handle
    // both success and failure paths in plain async/await (avoids fluture
    // type-inference issues with bichain).
    return attemptP<Error, PmConnectionRow>(async () => {
      let updatedTokens

      try {
        updatedTokens = await oauthProvider.refreshAccessToken(
          connection.refreshToken!
        )
      } catch (_err) {
        // Refresh failed — persist the needs_reauth status to the DB, then
        // surface a non-secret error. Token values are never exposed in
        // errors or logs.
        await database
          .updateTable('pm_connections')
          .set({
            status: 'needs_reauth',
            updatedAt: sql`NOW()`,
          })
          .where('accountId', '=', connection.accountId)
          .where('provider', '=', connection.provider)
          .execute()

        throw new Error('Token refresh failed; re-authorization required')
      }

      const newAccessToken = updatedTokens.accessToken()
      const newRefreshToken = updatedTokens.hasRefreshToken()
        ? updatedTokens.refreshToken()
        : connection.refreshToken
      const newExpiresAt = updatedTokens.accessTokenExpiresAt()

      // Atomically persist the rotated credentials
      const row = await database
        .updateTable('pm_connections')
        .set({
          accessToken: newAccessToken,
          refreshToken: newRefreshToken ?? null,
          expiresAt: newExpiresAt,
          updatedAt: sql`NOW()`,
        })
        .where('accountId', '=', connection.accountId)
        .where('provider', '=', connection.provider)
        .returning([
          'id',
          'accountId',
          'provider',
          'providerWorkspaceId',
          'accessToken',
          'refreshToken',
          'expiresAt',
          'scopes',
          'status',
          'createdAt',
          'updatedAt',
        ])
        .executeTakeFirstOrThrow()

      return row as PmConnectionRow
    })
  }

  /**
   * Return a guaranteed-valid access token for the given PM integration
   * connection, refreshing lazily when the stored token is stale.
   *
   * - If the stored token is fresh, returns it immediately (no I/O beyond
   *   the initial connection fetch).
   * - If the stored token is stale, exchanges the refresh token via the
   *   OAuth provider, atomically persists the rotated credentials, and
   *   returns the new access token.
   * - Concurrent calls for the same connection are single-flighted: only
   *   one refresh call is made, and all consumers receive the same result.
   * - On refresh failure the connection is marked `needs_reauth` and the
   *   Future rejects with a clear, non-secret error.  Tokens are never
   *   included in error messages or logs.
   */
  function getValidAccessToken(
    accountId: number,
    provider: PmProvider
  ): FutureInstance<Error, string> {
    const singleFlightKey = `${accountId}:${provider}`

    return getConnection(accountId, provider).pipe(
      chain(connection => {
        // If the connection is already in a failed auth state, reject
        // immediately without attempting refresh.
        if (connection.status === 'needs_reauth') {
          return reject(
            serviceUnavailable(
              'Token refresh failed; re-authorization required'
            )
          )
        }

        // If the token is still fresh, return it directly
        if (tokenIsFresh(connection.expiresAt)) {
          return resolve(connection.accessToken)
        }

        // If no refresh token is available, we cannot refresh — reject
        if (connection.refreshToken == null) {
          return reject(
            serviceUnavailable(
              'Token refresh failed; re-authorization required'
            )
          )
        }

        // Single-flight: check if a refresh is already in-flight for this
        // connection
        const existing = singleFlightMap.get(singleFlightKey)

        if (existing) {
          // Map the existing Future to just the access token
          return existing.pipe(map(row => row.accessToken))
        }

        // Create a new refresh Future, store it, and clean up on completion
        const refreshFuture = refreshAndPersistToken(connection).pipe(
          map(row => {
            singleFlightMap.delete(singleFlightKey)
            return row
          })
        )

        // Also clean up on rejection
        const guardedRefreshFuture = refreshFuture.pipe(
          mapRej(err => {
            singleFlightMap.delete(singleFlightKey)
            return err
          })
        ) as FutureInstance<Error, PmConnectionRow>

        singleFlightMap.set(singleFlightKey, guardedRefreshFuture)

        return guardedRefreshFuture.pipe(map(row => row.accessToken))
      })
    )
  }

  return {
    upsertConnection,
    getConnection,
    disconnectConnection,
    listConnections,
    getValidAccessToken,
  }
}

export type PmIntegrationService = ReturnType<typeof createPmIntegrationService>
