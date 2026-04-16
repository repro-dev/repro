-- Up
CREATE INDEX IF NOT EXISTS recordings_url_idx ON recordings ("url");
CREATE INDEX IF NOT EXISTS recordings_created_at_idx ON recordings ("createdAt");

-- Down
DROP INDEX IF EXISTS recordings_url_idx;
DROP INDEX IF EXISTS recordings_created_at_idx;
