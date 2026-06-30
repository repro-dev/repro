--
-- Up
--

CREATE TABLE IF NOT EXISTS totp_credentials (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users ("id") ON DELETE CASCADE,
  "secret" TEXT NOT NULL,
  "enabledAt" TIMESTAMPTZ,
  "lastUsedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_totp_credentials_user_id UNIQUE ("userId")
);


CREATE TABLE IF NOT EXISTS totp_backup_codes (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users ("id") ON DELETE CASCADE,
  "codeHash" TEXT NOT NULL,
  "usedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_totp_backup_codes_user_id ON totp_backup_codes ("userId");

CREATE TABLE IF NOT EXISTS mfa_pending_tokens (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users ("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mfa_pending_tokens_token_hash ON mfa_pending_tokens ("tokenHash");

--
-- Down
--

DROP INDEX IF EXISTS idx_mfa_pending_tokens_token_hash;
DROP INDEX IF EXISTS idx_totp_backup_codes_user_id;
DROP TABLE IF EXISTS mfa_pending_tokens;
DROP TABLE IF EXISTS totp_backup_codes;
DROP TABLE IF EXISTS totp_credentials;
