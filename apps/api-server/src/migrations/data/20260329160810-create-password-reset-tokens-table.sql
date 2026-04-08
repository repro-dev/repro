--
-- Up
--

CREATE TABLE password_reset_tokens (
  "id" SERIAL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "usedAt" TIMESTAMPTZ,
  FOREIGN KEY ("userId") REFERENCES users ("id"),
  CONSTRAINT password_reset_tokens_token UNIQUE ("token")
);

CREATE INDEX password_reset_tokens_token_idx ON password_reset_tokens ("token");
CREATE INDEX password_reset_tokens_userId_idx ON password_reset_tokens ("userId");

--
-- Down
--

DROP INDEX IF EXISTS password_reset_tokens_userId_idx;
DROP INDEX IF EXISTS password_reset_tokens_token_idx;
DROP TABLE IF EXISTS password_reset_tokens;
