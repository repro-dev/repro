--
-- Up
--

DO $$
DECLARE
  collision_list text;
BEGIN
  SELECT string_agg(normalized_email, ', ' ORDER BY normalized_email)
    INTO collision_list
  FROM (
    SELECT lower(email) AS normalized_email
    FROM staff_users
    GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) collisions;

  IF collision_list IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot enforce case-insensitive uniqueness on staff_users.email because existing rows collide under lower(email): %',
      collision_list
      USING HINT = 'Resolve the conflicting staff_users.email rows before rerunning this migration.';
  END IF;
END $$;

UPDATE staff_users
SET "email" = lower("email");

CREATE UNIQUE INDEX staff_users_email_lower_idx ON staff_users (lower("email"));

--
-- Down
--

DROP INDEX IF EXISTS staff_users_email_lower_idx;
