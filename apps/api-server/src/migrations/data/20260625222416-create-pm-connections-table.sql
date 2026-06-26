--
-- Up
--

CREATE TYPE pm_provider AS ENUM ('linear');

CREATE TABLE pm_connections (
  id SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL REFERENCES accounts(id),
  provider pm_provider NOT NULL,
  "providerWorkspaceId" VARCHAR(255) NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "expiresAt" TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'connected',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("accountId", provider)
);

--
-- Down
--

DROP TABLE IF EXISTS pm_connections;
DROP TYPE IF EXISTS pm_provider;
