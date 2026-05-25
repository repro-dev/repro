--
-- Up
--

CREATE TABLE "outbox_jobs" (
  "id" SERIAL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'running', 'succeeded', 'failed')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "maxAttempts" INTEGER NOT NULL DEFAULT 3 CHECK ("maxAttempts" >= 1),
  "runAfter" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMPTZ,
  "lockedBy" TEXT,
  "lastError" JSONB,
  "idempotencyKey" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "outbox_jobs_idempotency_key_unique_idx"
  ON "outbox_jobs" ("idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;

CREATE INDEX "outbox_jobs_pending_poll_idx"
  ON "outbox_jobs" ("status", "runAfter", "id")
  WHERE "status" = 'pending';

CREATE INDEX "outbox_jobs_failed_inspection_idx"
  ON "outbox_jobs" ("status", "type", "updatedAt")
  WHERE "status" = 'failed';

CREATE INDEX "outbox_jobs_stale_running_idx"
  ON "outbox_jobs" ("status", "lockedAt")
  WHERE "status" = 'running';

CREATE FUNCTION "set_outbox_jobs_updatedAt"()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "outbox_jobs_updatedAt_trigger"
BEFORE UPDATE ON "outbox_jobs"
FOR EACH ROW
EXECUTE FUNCTION "set_outbox_jobs_updatedAt"();

--
-- Down
--

DROP TRIGGER IF EXISTS "outbox_jobs_updatedAt_trigger" ON "outbox_jobs";
DROP FUNCTION IF EXISTS "set_outbox_jobs_updatedAt"();
DROP INDEX IF EXISTS "outbox_jobs_stale_running_idx";
DROP INDEX IF EXISTS "outbox_jobs_failed_inspection_idx";
DROP INDEX IF EXISTS "outbox_jobs_pending_poll_idx";
DROP INDEX IF EXISTS "outbox_jobs_idempotency_key_unique_idx";
DROP TABLE IF EXISTS "outbox_jobs";
