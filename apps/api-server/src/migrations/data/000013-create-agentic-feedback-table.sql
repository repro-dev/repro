--
-- Up
--

CREATE TABLE agentic_feedback (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "recordingId" TEXT,
  "sentiment" TEXT CHECK("sentiment" IN ('positive', 'negative')) NOT NULL,
  "promptVersion" TEXT NOT NULL DEFAULT '',
  "comment" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES users ("id")
);

CREATE INDEX agentic_feedback_user_idx ON agentic_feedback ("userId");
CREATE INDEX agentic_feedback_recording_idx ON agentic_feedback ("recordingId");

--
-- Down
--

DROP INDEX IF EXISTS agentic_feedback_recording_idx;
DROP INDEX IF EXISTS agentic_feedback_user_idx;
DROP TABLE IF EXISTS agentic_feedback;
