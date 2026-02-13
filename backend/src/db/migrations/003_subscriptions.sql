-- Subscription columns on restaurants table
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS subscription_state VARCHAR(20) DEFAULT NULL
    CHECK (subscription_state IS NULL OR subscription_state IN ('trialing', 'active', 'past_due', 'canceled')),
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_customer_id ON restaurants(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_stripe_subscription_id ON restaurants(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_subscription_state ON restaurants(subscription_state);
