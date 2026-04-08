--
-- Up
--

CREATE TABLE feature_gates (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT feature_gates_name UNIQUE ("name")
);

--
-- Down
--

DROP TABLE IF EXISTS feature_gates;