-- Restaurant SaaS Database Schema
-- PostgreSQL / Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Restaurants table
CREATE TABLE IF NOT EXISTS restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    location TEXT,
    owner_email VARCHAR(255) NOT NULL,
    tone_profile_json JSONB DEFAULT '{}',
    competitors_json JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    owner_phone VARCHAR(20),
    phone_verified BOOLEAN DEFAULT false,
    tier VARCHAR(50) DEFAULT 'review_drafts',
    monitoring_paused BOOLEAN DEFAULT false,
    sms_opted_out BOOLEAN DEFAULT false,
    subscription_state VARCHAR(50) DEFAULT 'trialing' CHECK (subscription_state IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid')),
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    trial_ends_at TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    google_access_token TEXT,
    google_refresh_token TEXT,
    google_token_expires_at TIMESTAMP WITH TIME ZONE,
    google_account_id VARCHAR(255),
    CONSTRAINT restaurants_owner_email_check CHECK (owner_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

CREATE INDEX IF NOT EXISTS idx_restaurants_owner_email ON restaurants(owner_email);
CREATE INDEX IF NOT EXISTS idx_restaurants_created_at ON restaurants(created_at);

-- Reviews table
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('google', 'yelp', 'tripadvisor', 'facebook')),
    review_id VARCHAR(255) NOT NULL,
    author VARCHAR(255),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    text TEXT,
    review_date TIMESTAMP WITH TIME ZONE,
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(platform, review_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_id ON reviews(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_reviews_platform ON reviews(platform);
CREATE INDEX IF NOT EXISTS idx_reviews_review_date ON reviews(review_date);
CREATE INDEX IF NOT EXISTS idx_reviews_ingested_at ON reviews(ingested_at);
CREATE INDEX IF NOT EXISTS idx_reviews_rating ON reviews(rating);

-- Reply drafts table
CREATE TABLE IF NOT EXISTS reply_drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    draft_text TEXT NOT NULL,
    escalation_flag BOOLEAN DEFAULT FALSE,
    escalation_reasons JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'sent')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_reply_drafts_review_id ON reply_drafts(review_id);
CREATE INDEX IF NOT EXISTS idx_reply_drafts_status ON reply_drafts(status);
CREATE INDEX IF NOT EXISTS idx_reply_drafts_escalation_flag ON reply_drafts(escalation_flag);
CREATE INDEX IF NOT EXISTS idx_reply_drafts_created_at ON reply_drafts(created_at);

-- Newsletters table
CREATE TABLE IF NOT EXISTS newsletters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    week_start_date DATE NOT NULL,
    content_html TEXT NOT NULL,
    content_json JSONB DEFAULT '{}',
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    UNIQUE(restaurant_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_newsletters_restaurant_id ON newsletters(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_newsletters_week_start_date ON newsletters(week_start_date);
CREATE INDEX IF NOT EXISTS idx_newsletters_sent_at ON newsletters(sent_at);

-- Email logs table
CREATE TABLE IF NOT EXISTS email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('reply_draft', 'newsletter', 'notification', 'welcome')),
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
    sent_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Foreign keys (optional, can be null for general notifications)
    review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
    reply_draft_id UUID REFERENCES reply_drafts(id) ON DELETE SET NULL,
    newsletter_id UUID REFERENCES newsletters(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_logs(type);
CREATE INDEX IF NOT EXISTS idx_email_logs_to_email ON email_logs(to_email);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON email_logs(created_at);

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reply_drafts_updated_at BEFORE UPDATE ON reply_drafts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Competitor reviews view (for newsletter generation)
CREATE OR REPLACE VIEW competitor_reviews_weekly AS
SELECT 
    r.id as restaurant_id,
    r.name as restaurant_name,
    comp.value->>'name' as competitor_name,
    comp.value->>'platform' as platform,
    rev.*
FROM restaurants r
CROSS JOIN LATERAL jsonb_array_elements(r.competitors_json) AS comp(value)
LEFT JOIN reviews rev ON rev.platform = (comp.value->>'platform')::VARCHAR
WHERE rev.review_date >= NOW() - INTERVAL '7 days'
ORDER BY rev.review_date DESC;

-- Add comments for documentation
COMMENT ON TABLE restaurants IS 'Restaurant accounts and their configuration';
COMMENT ON TABLE reviews IS 'All ingested reviews from various platforms';
COMMENT ON TABLE reply_drafts IS 'AI-generated draft replies for reviews';
COMMENT ON TABLE newsletters IS 'Weekly competitive intelligence newsletters';
COMMENT ON TABLE email_logs IS 'Log of all emails sent by the system';

COMMENT ON COLUMN restaurants.tone_profile_json IS 'Brand voice and tone configuration (e.g., {"tone": "friendly", "avoid": ["slang"]})';
COMMENT ON COLUMN restaurants.competitors_json IS 'List of competitor businesses to track (e.g., [{"name": "Joe''s Pizza", "platform": "google", "id": "..."}])';
COMMENT ON COLUMN reply_drafts.escalation_flag IS 'True if review contains sensitive issues requiring human attention';
COMMENT ON COLUMN reply_drafts.escalation_reasons IS 'Array of detected escalation triggers (e.g., ["health_issue", "refund_request"])';

-- OAuth state storage (replaces in-memory global state)
CREATE TABLE IF NOT EXISTS oauth_states (
    state_token VARCHAR(64) PRIMARY KEY,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at);

-- OTP codes table (phone verification — survives restarts)
CREATE TABLE IF NOT EXISTS otp_codes (
    restaurant_id UUID PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
    phone VARCHAR(20) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON otp_codes(expires_at);

-- Weekly digest table (Phase 6)
CREATE TABLE IF NOT EXISTS digests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    review_count INT DEFAULT 0,
    avg_rating NUMERIC(3,2) DEFAULT 0,
    positive_count INT DEFAULT 0,
    negative_count INT DEFAULT 0,
    response_rate INT DEFAULT 0,
    rating_distribution JSONB DEFAULT '{}',
    daily_counts JSONB DEFAULT '{}',
    praise_themes JSONB DEFAULT '[]',
    complaint_themes JSONB DEFAULT '[]',
    operational_insight TEXT,
    summary_text TEXT,
    email_sent_at TIMESTAMPTZ,
    sms_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(restaurant_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_digests_restaurant_id ON digests(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_digests_period_start ON digests(period_start);

-- Competitor Watch tables (Phase 6)
CREATE TABLE IF NOT EXISTS competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    place_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    lat NUMERIC(10,7),
    lng NUMERIC(10,7),
    added_by VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(restaurant_id, place_id)
);
CREATE INDEX IF NOT EXISTS idx_competitors_restaurant ON competitors(restaurant_id);

CREATE TABLE IF NOT EXISTS competitor_weekly_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    rating NUMERIC(2,1),
    user_ratings_total INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(competitor_id, period_start)
);
CREATE INDEX IF NOT EXISTS idx_cws_competitor ON competitor_weekly_snapshots(competitor_id);
CREATE INDEX IF NOT EXISTS idx_cws_period ON competitor_weekly_snapshots(period_start);
