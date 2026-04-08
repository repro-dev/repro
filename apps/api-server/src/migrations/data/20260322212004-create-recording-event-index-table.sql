--
-- Up
--

CREATE TABLE recording_event_index (
  "recordingId" INTEGER NOT NULL,
  "eventIndex" INTEGER NOT NULL,
  "eventType" SMALLINT NOT NULL,
  "timeMs" INTEGER NOT NULL,
  "byteOffset" BIGINT NOT NULL,
  "byteLength" INTEGER NOT NULL,
  PRIMARY KEY ("recordingId", "eventIndex"),
  FOREIGN KEY ("recordingId") REFERENCES recordings ("id")
);

CREATE INDEX recording_event_index_time_idx ON recording_event_index ("recordingId", "timeMs");
CREATE INDEX recording_event_index_type_time_idx ON recording_event_index ("recordingId", "eventType", "timeMs");

--
-- Down
--

DROP INDEX IF EXISTS recording_event_index_type_time_idx;
DROP INDEX IF EXISTS recording_event_index_time_idx;
DROP TABLE IF EXISTS recording_event_index;
