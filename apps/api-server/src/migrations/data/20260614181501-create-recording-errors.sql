--
-- Up
--

CREATE TABLE "recording_errors" (
  "id" SERIAL PRIMARY KEY,
  "recordingId" INTEGER NOT NULL REFERENCES recordings("id") ON DELETE CASCADE,
  "fingerprint" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "stackHash" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "recording_errors_fingerprint_idx"
  ON "recording_errors" ("fingerprint");

CREATE UNIQUE INDEX "recording_errors_dedup_idx"
  ON "recording_errors" ("recordingId", "fingerprint", "occurredAt");

--
-- Down
--

DROP INDEX IF EXISTS "recording_errors_dedup_idx";
DROP INDEX IF EXISTS "recording_errors_fingerprint_idx";
DROP TABLE IF EXISTS "recording_errors";
