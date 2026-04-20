import { sql } from 'kysely'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { after, before, describe, it } from 'node:test'
import { setUpTestDatabase } from '~/testing/database'

async function seedUser(
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

describe('agentic conversation migrations', () => {
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

  it('creates the conversation tables and stores structured messages', async () => {
    const userId = await seedUser(db)

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
    const conversationId = conversationResult.rows[0]!.id

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
        CAST(${JSON.stringify('Ready to help')} AS jsonb),
        CAST(${JSON.stringify([
          {
            id: 'call-1',
            index: 0,
            type: 'function',
            function: {
              name: 'ask-user',
              arguments: '{"prompt":"Need more info"}',
            },
          },
        ])} AS jsonb),
        NULL,
        CURRENT_TIMESTAMP
      )
    `.execute(db)

    await assert.rejects(
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
            3,
            'assistant',
            CAST(${JSON.stringify([
              { type: 'text', text: 'not allowed here' },
            ])} AS jsonb),
            NULL,
            NULL,
            CURRENT_TIMESTAMP
          )
        `.execute(db),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23514'
    )

    await assert.rejects(
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
            4,
            'tool',
            CAST(${JSON.stringify({
              type: 'text',
              text: 'wrong shape',
            })} AS jsonb),
            NULL,
            'call-2',
            CURRENT_TIMESTAMP
          )
        `.execute(db),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23514'
    )

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
        2,
        'tool',
        CAST(${JSON.stringify([
          { type: 'text', text: 'tool result' },
          {
            type: 'image_url',
            image_url: { url: 'https://example.test/tool.png' },
          },
        ])} AS jsonb),
        NULL,
        'call-1',
        CURRENT_TIMESTAMP
      )
    `.execute(db)

    const messagesResult = (await sql`
      SELECT role, sequence, "toolCalls"
      FROM agentic_conversation_messages
      WHERE "conversationId" = ${conversationId}
      ORDER BY sequence
    `.execute(db)) as unknown as {
      rows: Array<{
        role: string
        sequence: number
        toolCalls: Array<{
          id: string
          index: number
          type: 'function'
          function: { name: string; arguments: string }
        }> | null
      }>
    }

    assert.deepEqual(messagesResult.rows, [
      {
        role: 'assistant',
        sequence: 1,
        toolCalls: [
          {
            id: 'call-1',
            index: 0,
            type: 'function',
            function: {
              name: 'ask-user',
              arguments: '{"prompt":"Need more info"}',
            },
          },
        ],
      },
      { role: 'tool', sequence: 2, toolCalls: null },
    ])
  })

  it('rejects invalid conversation and message constraints', async () => {
    const userId = await seedUser(db)

    await assert.rejects(
      () =>
        sql`
          INSERT INTO agentic_conversations (
            "userId",
            "recordingId",
            "createdAt"
          )
          VALUES (999999, NULL, CURRENT_TIMESTAMP)
        `.execute(db),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23503'
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
    const conversationId = conversationResult.rows[0]!.id

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

    await assert.rejects(
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
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
    )

    await assert.rejects(
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
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23514'
    )

    await assert.rejects(
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
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23503'
    )

    await assert.rejects(
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
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23514'
    )
  })
})
