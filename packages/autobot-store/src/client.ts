import SQLiteDatabase from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { Future, type FutureInstance } from 'fluture'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import type { RepoRef } from '@repro/autobot-core'

import { migrateAutobotStore } from './migrations'
import type { AutobotSchema } from './schema'
import { createAutobotRepositories, type AutobotStore } from './repositories'

export interface OpenAutobotStoreInput {
  repo: RepoRef | string
}

export function resolveAutobotStateDir(repo: RepoRef | string): string {
  if (typeof repo === 'string') {
    return path.join(path.resolve(repo), '.autobot')
  }

  return path.resolve(repo.state_dir)
}

export function resolveAutobotDatabasePath(repo: RepoRef | string): string {
  return path.join(resolveAutobotStateDir(repo), 'autobot.sqlite')
}

export function createAutobotStoreClient(repo: RepoRef | string) {
  const databasePath = resolveAutobotDatabasePath(repo)
  const database = new SQLiteDatabase(databasePath)

  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')

  return new Kysely<AutobotSchema>({
    dialect: new SqliteDialect({ database }),
  })
}

export function createAutobotStore(
  input: OpenAutobotStoreInput
): FutureInstance<unknown, AutobotStore> {
  return Future((reject, resolve) => {
    let cancelled = false

    ;(async () => {
      try {
        const repo =
          typeof input.repo === 'string'
            ? {
                path: path.resolve(input.repo),
                state_dir: resolveAutobotStateDir(input.repo),
              }
            : {
                path: path.resolve(input.repo.path),
                state_dir: resolveAutobotStateDir(input.repo),
              }

        await mkdir(repo.state_dir, { recursive: true })

        const db = createAutobotStoreClient(repo)
        await migrateAutobotStore(db)

        const store = createAutobotRepositories(db, repo)
        if (!cancelled) {
          resolve(store)
        } else {
          await db.destroy()
        }
      } catch (error) {
        if (!cancelled) {
          reject(error)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  })
}
