--
-- Up
--

CREATE TABLE accounts (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invitations (
  "id" SERIAL PRIMARY KEY,
  "token" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "accountId" INTEGER NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY ("accountId") REFERENCES accounts ("id"),
  CONSTRAINT invitations_token UNIQUE ("token"),
  CONSTRAINT invitations_email UNIQUE ("email")
);

CREATE INDEX invitation_token_idx ON invitations ("token");
CREATE INDEX invitation_email_idx ON invitations ("email");
CREATE INDEX invitation_account_idx ON invitations ("accountId");

CREATE TABLE users (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "accountId" INTEGER NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "verificationToken" TEXT NOT NULL,
  "verified" INTEGER NOT NULL DEFAULT 0,
  "active" INTEGER NOT NULL DEFAULT 1,
  "admin" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId") REFERENCES accounts ("id"),
  CONSTRAINT users_email UNIQUE ("email")
);

CREATE INDEX user_account_idx ON users ("accountId");
CREATE INDEX user_email_idx ON users ("email");

CREATE TABLE staff_users (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1,
  "admin" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT staff_users_email UNIQUE ("email")
);

CREATE INDEX staff_users_email_idx ON staff_users ("email");

CREATE TABLE sessions (
  "id" SERIAL PRIMARY KEY,
  "sessionToken" TEXT NOT NULL,
  "subjectId" INTEGER NOT NULL,
  "subjectType" TEXT CHECK("subjectType" IN ('user', 'staff')) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "modifiedAt" TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT session_sessionToken UNIQUE ("sessionToken")
);

CREATE INDEX sessions_sessionToken_idx ON sessions ("sessionToken");

CREATE TABLE projects (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "accountId" INTEGER NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId") REFERENCES accounts ("id")
);

CREATE INDEX project_account_idx ON projects ("accountId");

CREATE TABLE project_recordings (
  "projectId" INTEGER NOT NULL,
  "recordingId" INTEGER NOT NULL,
  "authorId" INTEGER NOT NULL,
  FOREIGN KEY ("projectId") REFERENCES projects ("id"),
  FOREIGN KEY ("recordingId") REFERENCES recordings ("id"),
  FOREIGN KEY ("authorId") REFERENCES users ("id"),
  CONSTRAINT recording_constraint UNIQUE ("recordingId")
);

CREATE INDEX project_recordings_project_idx ON project_recordings ("projectId");
CREATE INDEX project_recordings_recording_idx ON project_recordings ("recordingId");
CREATE INDEX project_recordings_author_idx ON project_recordings ("authorId");

CREATE TABLE memberships (
  "userId" INTEGER NOT NULL,
  "projectId" INTEGER NOT NULL,
  "role" TEXT CHECK("role" IN ('admin', 'contributor', 'viewer')) NOT NULL DEFAULT 'viewer',
  FOREIGN KEY ("userId") REFERENCES users ("id"),
  FOREIGN KEY ("projectId") REFERENCES projects ("id"),
  CONSTRAINT user_project_constraint UNIQUE ("userId", "projectId")
);

CREATE INDEX membership_user_idx ON memberships ("userId");
CREATE INDEX membership_project_idx ON memberships ("projectId");

--
-- Down
--

DROP INDEX IF EXISTS membership_project_idx;
DROP INDEX IF EXISTS membership_user_idx;
DROP TABLE IF EXISTS memberships;

DROP INDEX IF EXISTS project_recordings_author_idx;
DROP INDEX IF EXISTS project_recordings_recording_idx;
DROP INDEX IF EXISTS project_recordings_project_idx;
DROP TABLE IF EXISTS project_recordings;

DROP INDEX IF EXISTS project_account_idx;
DROP TABLE IF EXISTS projects;

DROP INDEX IF EXISTS staff_users_email_idx;
DROP TABLE IF EXISTS staff_users;

DROP INDEX IF EXISTS sessions_sessionToken_idx;
DROP TABLE IF EXISTS sessions;

DROP INDEX IF EXISTS user_account_idx;
DROP TABLE IF EXISTS users;

DROP INDEX IF EXISTS invitation_token_idx;
DROP INDEX IF EXISTS invitation_email_idx;
DROP INDEX IF EXISTS invitation_account_idx;
DROP TABLE IF EXISTS invitations;

DROP TABLE IF EXISTS accounts;
