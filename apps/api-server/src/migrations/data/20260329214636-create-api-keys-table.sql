--
-- Up
--

-- Add key_prefix column for display purposes (first 8 chars of random portion)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS "keyPrefix" VARCHAR(8);

-- Add key_hash column for secure lookup (SHA-256 of full key)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS "keyHash" VARCHAR(64);

-- Add accountId for account-scoped revocation
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS "accountId" INTEGER REFERENCES accounts(id) ON DELETE CASCADE;

-- Add expiresAt for optional key expiry
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ;

-- Create index for fast hash-based lookups
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON api_keys ("keyHash");

-- Create index for user-scoped key listing
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys ("userId");

--
-- Down
--

DROP INDEX IF EXISTS api_keys_user_id_idx;
DROP INDEX IF EXISTS api_keys_key_hash_idx;

ALTER TABLE api_keys DROP COLUMN IF EXISTS "expiresAt";
ALTER TABLE api_keys DROP COLUMN IF EXISTS "accountId";
ALTER TABLE api_keys DROP COLUMN IF EXISTS "keyHash";
ALTER TABLE api_keys DROP COLUMN IF EXISTS "keyPrefix";
