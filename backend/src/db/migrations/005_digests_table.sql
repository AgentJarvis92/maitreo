-- Weekly Digest Table
-- Stores aggregated weekly review digests with AI-extracted themes

-- Add timezone + phone columns to restaurants if missing
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'America/New_York';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(20);

-- Weekly Digest Table
CREATE TABLE IF NOT EXISTS digests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    review_count INTEGER NOT NULL DEFAULT 0,
    avg_rating NUMERIC(3,2),
    positive_count INTEGER NOT NULL DEFAULT 0,
    negative_count INTEGER NOT NULL DEFAULT 0,
    response_rate NUMERIC(5,2) DEFAULT 0,
    rating_distribution JSONB DEFAULT '{}',
    daily_counts JSONB DEFAULT '{}',
    praise_themes JSONB DEFAULT '[]',
    complaint_themes JSONB DEFAULT '[]',
    operational_insight TEXT,
    summary_text TEXT,
    email_sent_at TIMESTAMP WITH TIME ZONE,
    sms_sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(restaurant_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_digests_restaurant_id ON digests(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_digests_period_start ON digests(period_start);
CREATE INDEX IF NOT EXISTS idx_digests_created_at ON digests(created_at);
