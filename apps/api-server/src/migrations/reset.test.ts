import expect from 'expect'
import { sql } from 'kysely'
import { describe, it } from 'node:test'
import { setUpTestDatabase } from '~/testing/database'
import { dropSchemaObjects } from './reset'

describe('Migrations > reset', () => {
  it('drops schema functions so migrations can be rerun', async () => {
    const { db, close } = await setUpTestDatabase()

    try {
      await sql`SELECT is_valid_agentic_assistant_tool_calls('[]'::jsonb)`.execute(
        db
      )

      await dropSchemaObjects(db)

      await expect(
        sql`SELECT is_valid_agentic_assistant_tool_calls('[]'::jsonb)`.execute(
          db
        )
      ).rejects.toThrow(/does not exist/i)
    } finally {
      await close()
    }
  })
})
