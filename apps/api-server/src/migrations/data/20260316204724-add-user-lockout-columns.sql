--
-- Up
--

ALTER TABLE users ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN "lockedUntil" TIMESTAMPTZ;

--
-- Down
--

ALTER TABLE users DROP COLUMN IF EXISTS "lockedUntil";
ALTER TABLE users DROP COLUMN IF EXISTS "failedLoginCount";
