import type {
  AgenticConversationAssistantToolCall,
  AgenticConversationId,
  AgenticConversationMessageId,
  AgenticConversationToolContent,
} from '@repro/domain'
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
    const conversationId: AgenticConversationId = conversationResult.rows[0]!.id

    const assistantToolCalls: Array<AgenticConversationAssistantToolCall> = [
      {
        id: 'call-1',
        index: 0,
        type: 'function',
        function: {
          name: 'ask-user',
          arguments: '{"prompt":"Need more info"}',
        },
      },
    ]

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
        CAST(${JSON.stringify(assistantToolCalls)} AS jsonb),
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
            2,
            'assistant',
            CAST(${JSON.stringify('Still here')} AS jsonb),
            CAST(${JSON.stringify([
              {
                id: 'call-2',
                index: 0,
                function: {
                  name: 'ask-user',
                  arguments: '{"prompt":"Need more info"}',
                },
              },
            ])} AS jsonb),
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
            3,
            'assistant',
            CAST(${JSON.stringify('Still here')} AS jsonb),
            CAST(${JSON.stringify([
              {
                id: 'call-3',
                index: 0,
                type: 'tool',
                function: {
                  name: 'ask-user',
                  arguments: '{"prompt":"Need more info"}',
                },
              },
            ])} AS jsonb),
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
            CAST(${JSON.stringify([
              {
                type: 'image_url',
                image_url: {},
              },
            ])} AS jsonb),
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
            CAST(${JSON.stringify([
              {
                type: 'text',
              },
            ])} AS jsonb),
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

    const toolContent: AgenticConversationToolContent = [
      { type: 'text', text: 'tool result' },
      {
        type: 'image_url',
        image_url: { url: 'https://example.test/tool.png' },
      },
    ]

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
        5,
        'tool',
        CAST(${JSON.stringify(toolContent)} AS jsonb),
        NULL,
        'call-1',
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
            6,
            'tool',
            CAST(${JSON.stringify([
              {
                text: 'missing type',
              },
            ])} AS jsonb),
            NULL,
            'call-1',
            CURRENT_TIMESTAMP
          )
        `.execute(db),
      (error: unknown) =>
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === '23514'
    )

    const messagesResult = (await sql`
      SELECT id, role, sequence, content, "toolCalls"
      FROM agentic_conversation_messages
      WHERE "conversationId" = ${conversationId}
      ORDER BY sequence
    `.execute(db)) as unknown as {
      rows: Array<{
        id: number
        role: string
        sequence: number
        content:
          | string
          | Array<
              | { type: 'text'; text: string }
              | { type: 'image_url'; image_url: { url: string } }
            >
        toolCalls: Array<AgenticConversationAssistantToolCall> | null
      }>
    }

    const assistantMessageId: AgenticConversationMessageId =
      messagesResult.rows[0]!.id

    assert.deepEqual(messagesResult.rows, [
      {
        id: assistantMessageId,
        role: 'assistant',
        sequence: 1,
        content: 'Ready to help',
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
      {
        id: messagesResult.rows[1]!.id,
        role: 'tool',
        sequence: 5,
        content: toolContent,
        toolCalls: null,
      },
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
