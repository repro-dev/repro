--
-- Up
--

ALTER TABLE recordings
  ADD COLUMN "dataUploadedAt" TIMESTAMPTZ,
  ADD COLUMN "eventIndexUploadedAt" TIMESTAMPTZ,
  ADD COLUMN "derivedProcessingReadyAt" TIMESTAMPTZ,
  ADD COLUMN "finalizedAt" TIMESTAMPTZ;

CREATE INDEX recordings_derived_processing_ready_idx
  ON recordings ("derivedProcessingReadyAt")
  WHERE "derivedProcessingReadyAt" IS NOT NULL;

--
-- Down
--

DROP INDEX IF EXISTS recordings_derived_processing_ready_idx;

ALTER TABLE recordings
  DROP COLUMN IF EXISTS "finalizedAt",
  DROP COLUMN IF EXISTS "derivedProcessingReadyAt",
  DROP COLUMN IF EXISTS "eventIndexUploadedAt",
  DROP COLUMN IF EXISTS "dataUploadedAt";
