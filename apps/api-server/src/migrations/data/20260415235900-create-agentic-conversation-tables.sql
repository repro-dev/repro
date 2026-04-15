--
-- Up
--

CREATE TABLE agentic_conversations (
  "id" SERIAL PRIMARY KEY,
  "recordingId" INTEGER NOT NULL,
  "userId" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("recordingId") REFERENCES recordings ("id") ON DELETE CASCADE,
  FOREIGN KEY ("userId") REFERENCES users ("id")
);

CREATE INDEX agentic_conversations_recording_idx ON agentic_conversations ("recordingId");

CREATE TRIGGER agentic_conversations_updated_at
  BEFORE UPDATE ON agentic_conversations
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TABLE agentic_messages (
  "id" SERIAL PRIMARY KEY,
  "conversationId" INTEGER NOT NULL,
  "role" TEXT CHECK("role" IN ('user', 'assistant', 'tool_call', 'tool_result')) NOT NULL,
  "content" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("conversationId") REFERENCES agentic_conversations ("id") ON DELETE CASCADE
);

CREATE INDEX agentic_messages_conversation_created_idx ON agentic_messages ("conversationId", "createdAt");

--
-- Down
--

DROP INDEX IF EXISTS agentic_messages_conversation_created_idx;
DROP TABLE IF EXISTS agentic_messages;

DROP TRIGGER IF EXISTS agentic_conversations_updated_at ON agentic_conversations;
DROP INDEX IF EXISTS agentic_conversations_recording_idx;
DROP TABLE IF EXISTS agentic_conversations;
