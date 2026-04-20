--
-- Up
--

CREATE FUNCTION is_valid_agentic_assistant_tool_calls(tool_calls JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN tool_calls IS NULL THEN true
    WHEN jsonb_typeof(tool_calls) <> 'array' THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(tool_calls) AS tool_call
      WHERE NOT (
        jsonb_typeof(tool_call) = 'object'
        AND CASE
          WHEN jsonb_typeof(tool_call) = 'object' THEN (
            SELECT count(*)
            FROM jsonb_object_keys(tool_call)
          ) = 4
          ELSE false
        END
        AND tool_call ? 'id'
        AND jsonb_typeof(tool_call -> 'id') = 'string'
        AND tool_call ? 'index'
        AND jsonb_typeof(tool_call -> 'index') = 'number'
        AND tool_call ? 'type'
        AND tool_call ->> 'type' = 'function'
        AND tool_call ? 'function'
        AND jsonb_typeof(tool_call -> 'function') = 'object'
        AND CASE
          WHEN jsonb_typeof(tool_call -> 'function') = 'object' THEN (
            SELECT count(*)
            FROM jsonb_object_keys(tool_call -> 'function')
          ) = 2
          ELSE false
        END
        AND (tool_call -> 'function') ? 'name'
        AND jsonb_typeof(tool_call -> 'function' -> 'name') = 'string'
        AND (tool_call -> 'function') ? 'arguments'
        AND jsonb_typeof(tool_call -> 'function' -> 'arguments') = 'string'
      )
    )
  END;
$$;

CREATE FUNCTION is_valid_agentic_tool_content(content JSONB)
RETURNS BOOLEAN
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE
    WHEN jsonb_typeof(content) = 'string' THEN true
    WHEN jsonb_typeof(content) <> 'array' THEN false
    ELSE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(content) AS block
      WHERE NOT (
        jsonb_typeof(block) = 'object'
        AND CASE
          WHEN jsonb_typeof(block) = 'object' THEN (
            SELECT count(*)
            FROM jsonb_object_keys(block)
          ) = 2
          ELSE false
        END
        AND (
          (
            block ->> 'type' = 'text'
            AND block ? 'text'
            AND jsonb_typeof(block -> 'text') = 'string'
          )
          OR (
            block ->> 'type' = 'image_url'
            AND block ? 'image_url'
            AND jsonb_typeof(block -> 'image_url') = 'object'
            AND CASE
              WHEN jsonb_typeof(block -> 'image_url') = 'object' THEN (
                SELECT count(*)
                FROM jsonb_object_keys(block -> 'image_url')
              ) = 1
              ELSE false
            END
            AND (block -> 'image_url') ? 'url'
            AND jsonb_typeof(block -> 'image_url' -> 'url') = 'string'
          )
        )
      )
    )
  END;
$$;

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
  CHECK (("role" <> 'assistant') OR is_valid_agentic_assistant_tool_calls("toolCalls")),
  CHECK (("role" = 'tool') OR (jsonb_typeof("content") = 'string')),
  CHECK (("role" <> 'tool') OR is_valid_agentic_tool_content("content"))
);

CREATE UNIQUE INDEX agentic_conversation_messages_order_idx
  ON agentic_conversation_messages ("conversationId", "sequence");

--
-- Down
--

DROP INDEX IF EXISTS agentic_conversation_messages_order_idx;
DROP TABLE IF EXISTS agentic_conversation_messages;
DROP FUNCTION IF EXISTS is_valid_agentic_tool_content(JSONB);
DROP FUNCTION IF EXISTS is_valid_agentic_assistant_tool_calls(JSONB);
DROP INDEX IF EXISTS agentic_conversations_recording_idx;
DROP INDEX IF EXISTS agentic_conversations_user_idx;
DROP TABLE IF EXISTS agentic_conversations;
