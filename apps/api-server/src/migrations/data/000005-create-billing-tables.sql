--
-- Up
--

CREATE TABLE billing_plans (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "providerPriceId" TEXT NOT NULL,
  "providerProductId" TEXT NOT NULL,
  "tier" TEXT CHECK("tier" IN ('free', 'pro', 'team', 'enterprise')) NOT NULL,
  "interval" TEXT CHECK("interval" IN ('month', 'year')) NOT NULL,
  "active" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT billing_plans_provider_price UNIQUE ("providerPriceId")
);

CREATE TABLE billing_customers (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL,
  "providerCustomerId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId") REFERENCES accounts ("id"),
  CONSTRAINT billing_customers_account UNIQUE ("accountId"),
  CONSTRAINT billing_customers_provider UNIQUE ("providerCustomerId")
);

CREATE INDEX billing_customers_account_idx ON billing_customers ("accountId");

CREATE TABLE billing_subscriptions (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL,
  "providerSubscriptionId" TEXT NOT NULL,
  "planId" INTEGER NOT NULL,
  "status" TEXT CHECK("status" IN ('active', 'past_due', 'paused', 'canceled', 'trialing')) NOT NULL,
  "currentPeriodStart" TIMESTAMPTZ NOT NULL,
  "currentPeriodEnd" TIMESTAMPTZ NOT NULL,
  "cancelAtPeriodEnd" INTEGER NOT NULL DEFAULT 0,
  "canceledAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId") REFERENCES accounts ("id"),
  FOREIGN KEY ("planId") REFERENCES billing_plans ("id"),
  CONSTRAINT billing_subscriptions_provider UNIQUE ("providerSubscriptionId")
);

CREATE INDEX billing_subscriptions_account_idx ON billing_subscriptions ("accountId");
CREATE INDEX billing_subscriptions_plan_idx ON billing_subscriptions ("planId");
CREATE INDEX billing_subscriptions_status_idx ON billing_subscriptions ("status");

CREATE OR REPLACE FUNCTION billing_subscriptions_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER billing_subscriptions_updated_at
  BEFORE UPDATE ON billing_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION billing_subscriptions_set_updated_at();

CREATE TABLE billing_entitlements (
  "id" SERIAL PRIMARY KEY,
  "accountId" INTEGER NOT NULL,
  "feature" TEXT NOT NULL,
  "enabled" INTEGER NOT NULL DEFAULT 1,
  "limit" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("accountId") REFERENCES accounts ("id"),
  CONSTRAINT billing_entitlements_account_feature UNIQUE ("accountId", "feature")
);

CREATE INDEX billing_entitlements_account_idx ON billing_entitlements ("accountId");

CREATE TABLE billing_events (
  "id" SERIAL PRIMARY KEY,
  "providerEventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "status" TEXT CHECK("status" IN ('pending', 'success', 'failed')) NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMPTZ,
  CONSTRAINT billing_events_provider_event UNIQUE ("providerEventId")
);

CREATE INDEX billing_events_type_idx ON billing_events ("eventType");
CREATE INDEX billing_events_status_idx ON billing_events ("status");

--
-- Down
--

DROP INDEX IF EXISTS billing_events_status_idx;
DROP INDEX IF EXISTS billing_events_type_idx;
DROP TABLE IF EXISTS billing_events;

DROP INDEX IF EXISTS billing_entitlements_account_idx;
DROP TABLE IF EXISTS billing_entitlements;

DROP TRIGGER IF EXISTS billing_subscriptions_updated_at ON billing_subscriptions;
DROP FUNCTION IF EXISTS billing_subscriptions_set_updated_at();
DROP INDEX IF EXISTS billing_subscriptions_status_idx;
DROP INDEX IF EXISTS billing_subscriptions_plan_idx;
DROP INDEX IF EXISTS billing_subscriptions_account_idx;
DROP TABLE IF EXISTS billing_subscriptions;

DROP INDEX IF EXISTS billing_customers_account_idx;
DROP TABLE IF EXISTS billing_customers;

DROP TABLE IF EXISTS billing_plans;
