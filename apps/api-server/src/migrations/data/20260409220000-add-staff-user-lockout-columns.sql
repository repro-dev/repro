--
-- Up
--

ALTER TABLE staff_users ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE staff_users ADD COLUMN "lockedUntil" TIMESTAMPTZ;

--
-- Down
--

ALTER TABLE staff_users DROP COLUMN IF EXISTS "lockedUntil";
ALTER TABLE staff_users DROP COLUMN IF EXISTS "failedLoginCount";
