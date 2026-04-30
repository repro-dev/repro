import type { AgenticConversationId } from '@repro/domain'
import { sql } from 'kysely'
import { after, before, describe, it } from 'node:test'
import { setUpTestDatabase } from '~/testing/database'
import { expectSqlErrorCode, seedUser } from './migrate.test-helpers'

describe('agentic conversation migration constraints', () => {
  let db: Awaited<ReturnType<typeof setUpTestDatabase>>['db']
  let close: Awaited<ReturnType<typeof setUpTestDatabase>>['close']

  before(async () => {
    const database = await setUpTestDatabase()
    db = database.db
    close = database.close
  })

  after(async () => {
    await close()
  })

  it('rejects invalid conversation and message constraints', async () => {
    const userId = await seedUser(db)

    await expectSqlErrorCode(
      () =>
        sql`
          INSERT INTO agentic_conversations (
            "userId",
            "recordingId",
            "createdAt"
          )
          VALUES (999999, NULL, CURRENT_TIMESTAMP)
        `.execute(db),
      '23503'
    )

    await sql`
      INSERT INTO agentic_conversations (
        "userId",
        "recordingId",
        "createdAt"
      )
      VALUES (${userId}, NULL, CURRENT_TIMESTAMP)
    `.execute(db)

    const conversationResult = (await sql`
      SELECT id
      FROM agentic_conversations
      WHERE "userId" = ${userId}
      ORDER BY id DESC
      LIMIT 1
    `.execute(db)) as unknown as { rows: Array<{ id: number }> }
    const conversationId: AgenticConversationId = conversationResult.rows[0]!.id

    await sql`
      INSERT INTO agentic_conversation_messages (
        "conversationId",
        "sequence",
        "role",
        "content",
        "toolCalls",
        "toolCallId",
        "createdAt"
      )
      VALUES (
        ${conversationId},
        1,
        'assistant',
        CAST(${JSON.stringify('Hello')} AS jsonb),
        NULL,
        NULL,
        CURRENT_TIMESTAMP
      )
    `.execute(db)

    await expectSqlErrorCode(
      () =>
        sql`
          INSERT INTO agentic_conversation_messages (
            "conversationId",
            "sequence",
            "role",
            "content",
            "toolCalls",
            "toolCallId",
            "createdAt"
          )
          VALUES (
            ${conversationId},
            1,
            'assistant',
            CAST(${JSON.stringify('Duplicate sequence')} AS jsonb),
            NULL,
            NULL,
            CURRENT_TIMESTAMP
          )
        `.execute(db),
      '23505'
    )

    await expectSqlErrorCode(
      () =>
        sql`
          INSERT INTO agentic_conversation_messages (
            "conversationId",
            "sequence",
            "role",
            "content",
            "toolCalls",
            "toolCallId",
            "createdAt"
          )
          VALUES (
            ${conversationId},
            2,
            'invalid-role',
            CAST(${JSON.stringify('Bad role')} AS jsonb),
            NULL,
            NULL,
            CURRENT_TIMESTAMP
          )
        `.execute(db),
      '23514'
    )

    await expectSqlErrorCode(
      () =>
        sql`
          INSERT INTO agentic_conversation_messages (
            "conversationId",
            "sequence",
            "role",
            "content",
            "toolCalls",
            "toolCallId",
            "createdAt"
          )
          VALUES (
            999999,
            2,
            'tool',
            CAST(${JSON.stringify('Missing parent')} AS jsonb),
            NULL,
            'call-2',
            CURRENT_TIMESTAMP
          )
        `.execute(db),
      '23503'
    )

    await expectSqlErrorCode(
      () =>
        sql`
          INSERT INTO agentic_conversation_messages (
            "conversationId",
            "sequence",
            "role",
            "content",
            "toolCalls",
            "toolCallId",
            "createdAt"
          )
          VALUES (
            ${conversationId},
            0,
            'user',
            CAST(${JSON.stringify('Out of order')} AS jsonb),
            NULL,
            NULL,
            CURRENT_TIMESTAMP
          )
        `.execute(db),
      '23514'
    )
  })
})
