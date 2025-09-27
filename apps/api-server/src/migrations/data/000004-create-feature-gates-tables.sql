--
-- Up
--

CREATE TABLE feature_gates (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT feature_gates_name UNIQUE ("name")
);

CREATE TABLE user_feature_gates (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "featureGateId" INTEGER NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "grantedBy" INTEGER,
  FOREIGN KEY ("userId") REFERENCES users ("id"),
  FOREIGN KEY ("featureGateId") REFERENCES feature_gates ("id"),
  CONSTRAINT user_feature_gates_unique UNIQUE ("userId", "featureGateId")
);

CREATE INDEX user_feature_gates_user_idx ON user_feature_gates ("userId");
CREATE INDEX user_feature_gates_gate_idx ON user_feature_gates ("featureGateId");

CREATE TABLE account_feature_gates (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL,
  "featureGateId" INTEGER NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "grantedBy" INTEGER,
  FOREIGN KEY ("accountId") REFERENCES accounts ("id"),
  FOREIGN KEY ("featureGateId") REFERENCES feature_gates ("id"),
  CONSTRAINT account_feature_gates_unique UNIQUE ("accountId", "featureGateId")
);

CREATE INDEX account_feature_gates_account_idx ON account_feature_gates ("accountId");
CREATE INDEX account_feature_gates_gate_idx ON account_feature_gates ("featureGateId");

--
-- Down
--

DROP INDEX IF EXISTS account_feature_gates_gate_idx;
DROP INDEX IF EXISTS account_feature_gates_account_idx;
DROP TABLE IF EXISTS account_feature_gates;

DROP INDEX IF EXISTS user_feature_gates_gate_idx;
DROP INDEX IF EXISTS user_feature_gates_user_idx;
DROP TABLE IF EXISTS user_feature_gates;

DROP TABLE IF EXISTS feature_gates;