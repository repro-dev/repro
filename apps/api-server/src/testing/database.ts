import getPort from 'get-port'
import path from 'node:path'
import { Pool } from 'pg'
import { exec } from 'teen_process'
import { migrate } from '~/migrations/migrate'
import { createPostgresDatabaseClient } from '~/modules/database'

export async function setUpTestDatabase() {
  const bin = path.resolve(__dirname, 'pg_tmp.sh')
  const port = await getPort()

  const { stdout: connectionString } = await exec(bin, [
    '-t',
    '-w',
    '5',
    '-p',
    `${port}`,
  ])

  const db = new Pool({
    connectionString,
  })

  const client = createPostgresDatabaseClient(db)

  await migrate(client, { quiet: !process.env.CI })

  return {
    db: client,
    close: async () => db.end(),
  }
}
