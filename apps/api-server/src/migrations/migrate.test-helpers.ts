import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import type { setUpTestDatabase } from '~/testing/database'

export async function seedUser(
  db: Awaited<ReturnType<typeof setUpTestDatabase>>['db']
) {
  const accountName = `Agentic Test Account ${randomUUID()}`
  const email = `agentic-${randomUUID()}@example.test`

  await sql`
    INSERT INTO accounts ("name", "active", "createdAt")
    VALUES (${accountName}, true, CURRENT_TIMESTAMP)
  `.execute(db)

  const accountResult = (await sql`
    SELECT id
    FROM accounts
    WHERE "name" = ${accountName}
    ORDER BY id DESC
    LIMIT 1
  `.execute(db)) as unknown as { rows: Array<{ id: number }> }
  const accountId = accountResult.rows[0]!.id

  await sql`
    INSERT INTO users (
      "name",
      "accountId",
      "email",
      "password",
      "verificationToken",
      "verified",
      "active",
      "admin",
      "createdAt"
    )
      VALUES (
      'Agentic Test User',
      ${accountId},
      ${email},
      'password',
      'token',
      true,
      true,
      false,
      CURRENT_TIMESTAMP
    )
  `.execute(db)

  const userResult = (await sql`
    SELECT id
    FROM users
    WHERE "email" = ${email}
    ORDER BY id DESC
    LIMIT 1
  `.execute(db)) as unknown as { rows: Array<{ id: number }> }

  return userResult.rows[0]!.id
}

export async function expectSqlErrorCode(
  action: () => Promise<unknown>,
  code: string
) {
  await assert.rejects(
    action,
    (error: unknown) =>
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === code
  )
}
