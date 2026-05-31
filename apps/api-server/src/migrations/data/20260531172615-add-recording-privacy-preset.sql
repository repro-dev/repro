--
-- Up
--
ALTER TABLE accounts ADD COLUMN "recordingPrivacyPreset" TEXT NOT NULL DEFAULT 'standard';
--
-- Down
--
ALTER TABLE accounts DROP COLUMN "recordingPrivacyPreset";
