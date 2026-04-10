--
-- Up
--

TRUNCATE sessions;

ALTER TABLE sessions RENAME COLUMN "sessionToken" TO "sessionTokenHash";

DROP INDEX IF EXISTS sessions_sessionToken_idx;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS session_sessionToken;

ALTER TABLE sessions ADD CONSTRAINT session_sessionTokenHash UNIQUE ("sessionTokenHash");
CREATE INDEX sessions_sessionTokenHash_idx ON sessions ("sessionTokenHash");

--
-- Down
--

TRUNCATE sessions;

DROP INDEX IF EXISTS sessions_sessionTokenHash_idx;
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS session_sessionTokenHash;

ALTER TABLE sessions RENAME COLUMN "sessionTokenHash" TO "sessionToken";

ALTER TABLE sessions ADD CONSTRAINT session_sessionToken UNIQUE ("sessionToken");
CREATE INDEX sessions_sessionToken_idx ON sessions ("sessionToken");
