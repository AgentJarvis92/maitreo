-- Migration: Add crisis alerts and competitor snapshots tables
-- Created: 2026-02-13

-- Crisis alerts table (for tracking crisis notifications)
CREATE TABLE IF NOT EXISTS crisis_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL, -- 'multiple_negative', 'critical_keyword', 'rating_drop'
  severity TEXT NOT NULL, -- 'high' or 'critical'
  review_count INTEGER NOT NULL DEFAULT 0,
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_crisis_alerts_restaurant ON crisis_alerts(restaurant_id, created_at DESC);

-- Competitor snapshots table (for tracking competitor metrics over time)
CREATE TABLE IF NOT EXISTS competitor_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  competitor_id TEXT NOT NULL,
  competitor_name TEXT NOT NULL,
  platform TEXT NOT NULL, -- 'yelp', 'google', 'tripadvisor'
  rating NUMERIC(2, 1),
  review_count INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_restaurant ON competitor_snapshots(restaurant_id, competitor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_snapshots_created ON competitor_snapshots(created_at DESC);

-- Comments
COMMENT ON TABLE crisis_alerts IS 'Tracks crisis events and SMS alerts sent to restaurant owners';
COMMENT ON TABLE competitor_snapshots IS 'Stores historical competitor data for trend analysis';
