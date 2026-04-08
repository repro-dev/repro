--
-- Up
--

CREATE TABLE recording_resources (
  "id" SERIAL PRIMARY KEY,
  "recordingId" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  FOREIGN KEY ("recordingId") REFERENCES recordings ("id")
);

--
-- Down
--

DROP TABLE IF EXISTS recording_resources;
