--
-- Up
--

CREATE TABLE recordings (
  "id" SERIAL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "mode" INTEGER NOT NULL,
  "duration" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "browserName" TEXT,
  "browserVersion" TEXT,
  "operatingSystem" TEXT,
  "codecVersion" TEXT NOT NULL
);

--
-- Down
--

DROP TABLE IF EXISTS recordings;
