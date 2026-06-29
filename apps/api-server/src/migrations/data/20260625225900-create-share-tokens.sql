--
-- Up
--

CREATE TABLE share_tokens (
  "id" SERIAL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" INTEGER NOT NULL,
  "createdBy" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  FOREIGN KEY ("createdBy") REFERENCES users ("id"),
  CONSTRAINT share_tokens_token UNIQUE ("token")
);

CREATE INDEX share_tokens_token_idx ON share_tokens ("token");
CREATE INDEX share_tokens_resource_idx ON share_tokens ("resourceType", "resourceId");

--
-- Down
--

DROP INDEX IF EXISTS share_tokens_resource_idx;
DROP INDEX IF EXISTS share_tokens_token_idx;
DROP TABLE IF EXISTS share_tokens;
