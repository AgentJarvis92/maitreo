-- Restaurant SaaS Database Schema
-- PostgreSQL 16+ / Supabase
-- Created: 2026-02-10

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- RESTAURANTS TABLE
-- ========================================
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    owner_email VARCHAR(255) NOT NULL,
    
    -- Brand voice customization stored as JSON
    -- Structure: {tone: string, personality: string[], avoid: string[], emphasis: string[]}
    tone_profile_json JSONB DEFAULT '{}',
    
    -- Competitor tracking stored as JSON array
    -- Structure: [{name: string, platform: string, id: string}]
    competitors_json JSONB DEFAULT '[]',
    
    -- Platform credentials (encrypted in production)
    google_place_id VARCHAR(255),
    yelp_business_id VARCHAR(255),
    
    -- Subscription tier
    tier VARCHAR(50) DEFAULT 'review_drafts', -- 'review_drafts' or 'review_plus_intel'
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for restaurants
CREATE INDEX idx_restaurants_owner_email ON restaurants(owner_email);
CREATE INDEX idx_restaurants_tier ON restaurants(tier);

-- ========================================
-- REVIEWS TABLE
-- ========================================
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    
    -- Platform details
    platform VARCHAR(50) NOT NULL, -- 'google', 'yelp', 'tripadvisor', etc.
    review_id VARCHAR(255) NOT NULL, -- External platform review ID
    
    -- Review content
    author VARCHAR(255),
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    text TEXT,
    review_date TIMESTAMP WITH TIME ZONE,
    
    -- Metadata (flexible JSON for platform-specific fields)
    -- Examples: {review_url: string, helpful_count: number, photos: string[]}
    metadata JSONB DEFAULT '{}',
    
    -- Tracking
    ingested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure no duplicate reviews from same platform
    CONSTRAINT unique_platform_review UNIQUE(platform, review_id)
);

-- Indexes for reviews
CREATE INDEX idx_reviews_restaurant_id ON reviews(restaurant_id);
CREATE INDEX idx_reviews_platform ON reviews(platform);
CREATE INDEX idx_reviews_rating ON reviews(rating);
CREATE INDEX idx_reviews_review_date ON reviews(review_date DESC);
CREATE INDEX idx_reviews_ingested_at ON reviews(ingested_at DESC);

-- ========================================
-- REPLY_DRAFTS TABLE
-- ========================================
CREATE TABLE reply_drafts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    
    -- Generated reply content
    draft_text TEXT NOT NULL,
    
    -- Escalation detection
    escalation_flag BOOLEAN DEFAULT FALSE,
    escalation_reasons JSONB DEFAULT '[]', -- Array of strings: ['health_code', 'legal_threat', etc.]
    
    -- Workflow status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'sent'
    
    -- Alternative drafts (optional - GPT can generate multiple options)
    alternative_drafts JSONB DEFAULT '[]', -- Array of {text: string, tone: string}
    
    -- AI metadata
    ai_confidence DECIMAL(3,2), -- 0.00 to 1.00
    ai_model_version VARCHAR(50), -- 'gpt-4-2024-02', etc.
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    -- Ensure only one active draft per review
    CONSTRAINT unique_review_draft UNIQUE(review_id)
);

-- Indexes for reply_drafts
CREATE INDEX idx_reply_drafts_review_id ON reply_drafts(review_id);
CREATE INDEX idx_reply_drafts_status ON reply_drafts(status);
CREATE INDEX idx_reply_drafts_escalation_flag ON reply_drafts(escalation_flag);
CREATE INDEX idx_reply_drafts_created_at ON reply_drafts(created_at DESC);

-- ========================================
-- NEWSLETTERS TABLE
-- ========================================
CREATE TABLE newsletters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    
    -- Week identifier
    week_start_date DATE NOT NULL, -- Monday of the week
    
    -- Newsletter content
    content_html TEXT, -- Rendered HTML for email
    content_json JSONB, -- Structured data: {wins: [], mistakes: [], trends: [], actions: []}
    
    -- Tracking
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one newsletter per restaurant per week
    CONSTRAINT unique_restaurant_week UNIQUE(restaurant_id, week_start_date)
);

-- Indexes for newsletters
CREATE INDEX idx_newsletters_restaurant_id ON newsletters(restaurant_id);
CREATE INDEX idx_newsletters_week_start_date ON newsletters(week_start_date DESC);
CREATE INDEX idx_newsletters_sent_at ON newsletters(sent_at DESC);

-- ========================================
-- EMAIL_LOGS TABLE
-- ========================================
CREATE TABLE email_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Email type
    type VARCHAR(50) NOT NULL, -- 'reply_draft', 'newsletter', 'notification', 'onboarding'
    
    -- Recipient
    to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced', 'opened', 'clicked'
    error_message TEXT,
    
    -- External email service tracking
    external_id VARCHAR(255), -- Resend message ID or other provider ID
    
    -- Relationships (nullable - not all emails relate to entities)
    review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
    reply_draft_id UUID REFERENCES reply_drafts(id) ON DELETE SET NULL,
    newsletter_id UUID REFERENCES newsletters(id) ON DELETE SET NULL,
    
    -- Timestamps
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for email_logs
CREATE INDEX idx_email_logs_type ON email_logs(type);
CREATE INDEX idx_email_logs_status ON email_logs(status);
CREATE INDEX idx_email_logs_to_email ON email_logs(to_email);
CREATE INDEX idx_email_logs_created_at ON email_logs(created_at DESC);
CREATE INDEX idx_email_logs_review_id ON email_logs(review_id);
CREATE INDEX idx_email_logs_newsletter_id ON email_logs(newsletter_id);

-- ========================================
-- UTILITY FUNCTIONS
-- ========================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to restaurants
CREATE TRIGGER update_restaurants_updated_at
    BEFORE UPDATE ON restaurants
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply updated_at trigger to reply_drafts
CREATE TRIGGER update_reply_drafts_updated_at
    BEFORE UPDATE ON reply_drafts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- SAMPLE DATA (OPTIONAL - REMOVE IN PRODUCTION)
-- ========================================

-- Sample restaurant for testing
INSERT INTO restaurants (
    name, 
    location, 
    owner_email, 
    tone_profile_json,
    competitors_json,
    google_place_id,
    tier
) VALUES (
    'Sample BBQ Pit',
    'Atlanta, GA',
    'owner@samplebbq.com',
    '{
        "tone": "friendly",
        "personality": ["southern hospitality", "family-owned", "authentic"],
        "avoid": ["corporate", "franchise", "generic"],
        "emphasis": ["quality ingredients", "family recipes", "community"]
    }'::jsonb,
    '[
        {"name": "Ribs & More", "platform": "google", "id": "ChIJxxx"},
        {"name": "Smokey Joe''s", "platform": "yelp", "id": "smokey-joes-atlanta"}
    ]'::jsonb,
    'ChIJSamplePlaceID123',
    'review_plus_intel'
)
ON CONFLICT DO NOTHING;

-- ========================================
-- VIEWS (OPTIONAL - FOR REPORTING)
-- ========================================

-- View: Pending reply drafts by restaurant
CREATE OR REPLACE VIEW pending_reply_drafts AS
SELECT 
    r.id AS restaurant_id,
    r.name AS restaurant_name,
    r.owner_email,
    rv.platform,
    rv.rating,
    rv.author,
    rv.review_date,
    rd.draft_text,
    rd.escalation_flag,
    rd.created_at AS draft_created_at
FROM restaurants r
JOIN reviews rv ON r.id = rv.restaurant_id
JOIN reply_drafts rd ON rv.id = rd.review_id
WHERE rd.status = 'pending'
ORDER BY rd.created_at DESC;

-- View: Email delivery stats by type
CREATE OR REPLACE VIEW email_stats AS
SELECT 
    type,
    status,
    COUNT(*) AS count,
    DATE_TRUNC('day', created_at) AS date
FROM email_logs
GROUP BY type, status, DATE_TRUNC('day', created_at)
ORDER BY date DESC, type, status;

-- ========================================
-- COMMENTS
-- ========================================

COMMENT ON TABLE restaurants IS 'Core restaurant accounts and configuration';
COMMENT ON TABLE reviews IS 'Ingested reviews from Google, Yelp, etc.';
COMMENT ON TABLE reply_drafts IS 'AI-generated reply drafts awaiting owner approval';
COMMENT ON TABLE newsletters IS 'Weekly competitor intelligence newsletters';
COMMENT ON TABLE email_logs IS 'Audit log of all emails sent by the system';

COMMENT ON COLUMN restaurants.tone_profile_json IS 'Brand voice customization from onboarding form';
COMMENT ON COLUMN restaurants.competitors_json IS 'List of competitors to track for intelligence';
COMMENT ON COLUMN reply_drafts.escalation_flag IS 'True if review contains sensitive topics requiring manual review';
COMMENT ON COLUMN newsletters.content_json IS 'Structured newsletter data: wins, mistakes, trends, action items';

-- ========================================
-- SECURITY (ROW LEVEL SECURITY - OPTIONAL)
-- ========================================

-- Enable RLS on all tables (uncomment if using Supabase Auth)
-- ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE reply_drafts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE newsletters ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Example RLS policy (restrict access to owner's own restaurant data)
-- CREATE POLICY restaurants_owner_policy ON restaurants
--     FOR ALL
--     USING (owner_email = auth.jwt() ->> 'email');

-- ========================================
-- END OF SCHEMA
-- ========================================

-- Verify installation
SELECT 
    'Schema installation complete!' AS status,
    COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema = 'public'
    AND table_type = 'BASE TABLE'
    AND table_name IN ('restaurants', 'reviews', 'reply_drafts', 'newsletters', 'email_logs');
