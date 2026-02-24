-- Maitreo Schema Migration 001
-- Creates all tables, enums, indexes, RLS policies, and trigger functions

BEGIN;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE review_state AS ENUM (
  'draft_generated',
  'pending_approval',
  'posted',
  'ignored'
);

CREATE TYPE reply_status AS ENUM (
  'draft',
  'approved',
  'posted',
  'failed'
);

CREATE TYPE subscription_state AS ENUM (
  'trialing',
  'active',
  'past_due',
  'canceled'
);

CREATE TYPE sms_direction AS ENUM ('inbound', 'outbound');
CREATE TYPE sms_status AS ENUM ('sent', 'delivered', 'failed');
CREATE TYPE conversation_state AS ENUM ('waiting_custom_reply');
CREATE TYPE review_platform AS ENUM ('google');

-- ============================================================
-- TABLES
-- ============================================================

-- 1. restaurants
CREATE TABLE restaurants (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  address         text,
  phone           text,
  email           text,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Google OAuth
  google_account_id    text,
  google_access_token  text,          -- encrypt via pgcrypto or vault
  google_refresh_token text,          -- encrypt via pgcrypto or vault
  google_token_expires_at timestamptz,
  google_location_id   text,

  -- Operational
  monitoring_enabled   boolean NOT NULL DEFAULT false,
  subscription_state   subscription_state  -- denormalized for fast gate checks
);

-- 2. subscriptions
CREATE TABLE subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id          uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  stripe_customer_id     text NOT NULL,
  stripe_subscription_id text UNIQUE NOT NULL,
  state                  subscription_state NOT NULL DEFAULT 'trialing',
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_subscriptions_restaurant UNIQUE (restaurant_id)
);

-- 3. reviews
CREATE TABLE reviews (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  platform        review_platform NOT NULL DEFAULT 'google',
  review_id       text NOT NULL,        -- Google's external ID
  author          text,
  rating          smallint CHECK (rating BETWEEN 1 AND 5),
  text            text,
  review_date     timestamptz,
  replied         boolean NOT NULL DEFAULT false,
  pending_state   review_state,         -- NULL = new/unprocessed
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_reviews_platform_id UNIQUE (platform, review_id)
);

-- 4. replies
CREATE TABLE replies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id     uuid NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  draft_text    text NOT NULL,
  final_text    text,
  posted_at     timestamptz,
  status        reply_status NOT NULL DEFAULT 'draft',
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 5. sms_logs
CREATE TABLE sms_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  direction       sms_direction NOT NULL,
  from_number     text NOT NULL,
  to_number       text NOT NULL,
  body            text,
  command_parsed  text,               -- e.g. 'APPROVE', 'IGNORE', 'EDIT ...'
  status          sms_status NOT NULL DEFAULT 'sent',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- 6. sms_context
CREATE TABLE sms_context (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id           uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  phone_number            text NOT NULL,
  last_pending_review_id  uuid REFERENCES reviews(id) ON DELETE SET NULL,
  conversation_state      conversation_state, -- NULL = idle
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_sms_context_restaurant_phone UNIQUE (restaurant_id, phone_number)
);

-- 7. digests
CREATE TABLE digests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  period_start     timestamptz NOT NULL,
  period_end       timestamptz NOT NULL,
  review_count     integer NOT NULL DEFAULT 0,
  avg_rating       numeric(3,2),
  praise_themes    jsonb DEFAULT '[]'::jsonb,
  complaint_themes jsonb DEFAULT '[]'::jsonb,
  summary_text     text,
  sent_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- restaurants
CREATE INDEX idx_restaurants_subscription_state ON restaurants(subscription_state)
  WHERE monitoring_enabled = true;

-- subscriptions
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);
CREATE INDEX idx_subscriptions_state ON subscriptions(state);

-- reviews
CREATE INDEX idx_reviews_restaurant ON reviews(restaurant_id);
CREATE INDEX idx_reviews_pending ON reviews(restaurant_id, pending_state)
  WHERE pending_state IS NOT NULL;
CREATE INDEX idx_reviews_review_id ON reviews(review_id);
CREATE INDEX idx_reviews_date ON reviews(restaurant_id, review_date DESC);

-- replies
CREATE INDEX idx_replies_review ON replies(review_id);
CREATE INDEX idx_replies_status ON replies(status) WHERE status != 'posted';

-- sms_logs
CREATE INDEX idx_sms_logs_restaurant ON sms_logs(restaurant_id, created_at DESC);

-- sms_context
CREATE INDEX idx_sms_context_phone ON sms_context(phone_number);

-- digests
CREATE INDEX idx_digests_restaurant_period ON digests(restaurant_id, period_end DESC);

-- ============================================================
-- TRIGGER: sync subscription state to restaurants
-- ============================================================

CREATE OR REPLACE FUNCTION sync_subscription_state()
RETURNS trigger AS $$
BEGIN
  UPDATE restaurants
  SET subscription_state = NEW.state
  WHERE id = NEW.restaurant_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_subscription_state
  AFTER INSERT OR UPDATE OF state ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION sync_subscription_state();

-- ============================================================
-- TRIGGER: auto-update sms_context.updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sms_context_updated
  BEFORE UPDATE ON sms_context
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- MONITORING GATE VIEW (convenience)
-- ============================================================

CREATE VIEW active_monitored_restaurants AS
SELECT r.id, r.name, r.google_location_id
FROM restaurants r
WHERE r.monitoring_enabled = true
  AND r.subscription_state IN ('trialing', 'active');

-- ============================================================
-- ROW LEVEL SECURITY (enable, policies added per auth strategy)
-- ============================================================

ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests ENABLE ROW LEVEL SECURITY;

COMMIT;
