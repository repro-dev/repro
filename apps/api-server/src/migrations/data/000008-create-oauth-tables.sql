--
-- Up
--

CREATE TABLE oauth_clients (
  id SERIAL PRIMARY KEY,
  "clientId" VARCHAR(64) NOT NULL UNIQUE,
  "clientSecret" VARCHAR(64),
  name VARCHAR(255) NOT NULL,
  "redirectUris" TEXT[] NOT NULL DEFAULT '{}',
  "userId" INTEGER NOT NULL REFERENCES users(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE oauth_authorization_codes (
  id SERIAL PRIMARY KEY,
  code VARCHAR(128) NOT NULL UNIQUE,
  "clientId" VARCHAR(64) NOT NULL,
  "userId" INTEGER NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "codeChallenge" VARCHAR(128) NOT NULL,
  "codeChallengeMethod" VARCHAR(10) NOT NULL DEFAULT 'S256',
  scopes TEXT[] NOT NULL DEFAULT '{}',
  "expiresAt" TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  token VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  "userId" INTEGER NOT NULL REFERENCES users(id),
  scopes TEXT[] NOT NULL DEFAULT '{}',
  "lastUsedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "revokedAt" TIMESTAMPTZ
);

--
-- Down
--

DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS oauth_authorization_codes;
DROP TABLE IF EXISTS oauth_clients;
