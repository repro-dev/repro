import { PmProvider } from '@repro/domain'
import { chain, FutureInstance, map, reject, resolve } from 'fluture'
import { sql } from 'kysely'
import { attemptQuery, Database } from '~/modules/database'
import { notFound } from '~/utils/errors'

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

export function createPmIntegrationService(database: Database) {
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

  return {
    upsertConnection,
    getConnection,
    disconnectConnection,
    listConnections,
  }
}

export type PmIntegrationService = ReturnType<typeof createPmIntegrationService>
