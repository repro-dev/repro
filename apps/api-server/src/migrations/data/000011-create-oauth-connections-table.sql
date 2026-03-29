--
-- Up
--

CREATE TYPE oauth_provider AS ENUM ('google');

CREATE TABLE oauth_connections (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES users(id),
  provider oauth_provider NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "expiresAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("provider", "providerAccountId")
);

--
-- Down
--

DROP TABLE IF EXISTS oauth_connections;
DROP TYPE IF EXISTS oauth_provider;
