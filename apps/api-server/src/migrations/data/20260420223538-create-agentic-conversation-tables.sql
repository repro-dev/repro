--
-- Up
--

CREATE TABLE agentic_conversations (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "recordingId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES users ("id")
);

CREATE INDEX agentic_conversations_user_idx ON agentic_conversations ("userId");
CREATE INDEX agentic_conversations_recording_idx ON agentic_conversations ("recordingId");

CREATE TABLE agentic_conversation_messages (
  "id" SERIAL PRIMARY KEY,
  "conversationId" INTEGER NOT NULL,
  "sequence" INTEGER NOT NULL,
  "role" TEXT NOT NULL CHECK ("role" IN ('assistant', 'system', 'tool', 'user')),
  "content" JSONB NOT NULL,
  "toolCalls" JSONB,
  "toolCallId" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("conversationId") REFERENCES agentic_conversations ("id") ON DELETE CASCADE,
  CHECK ("sequence" > 0),
  CHECK (("role" <> 'tool') OR ("toolCallId" IS NOT NULL)),
  CHECK (("role" = 'tool') OR ("toolCallId" IS NULL)),
  CHECK (("role" = 'assistant') OR ("toolCalls" IS NULL)),
  CHECK (("role" = 'tool') OR (jsonb_typeof("content") = 'string')),
  CHECK (("role" <> 'tool') OR (jsonb_typeof("content") IN ('string', 'array')))
);

CREATE UNIQUE INDEX agentic_conversation_messages_order_idx
  ON agentic_conversation_messages ("conversationId", "sequence");

--
-- Down
--

DROP INDEX IF EXISTS agentic_conversation_messages_order_idx;
DROP TABLE IF EXISTS agentic_conversation_messages;
DROP INDEX IF EXISTS agentic_conversations_recording_idx;
DROP INDEX IF EXISTS agentic_conversations_user_idx;
DROP TABLE IF EXISTS agentic_conversations;
