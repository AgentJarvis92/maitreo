-- Migration: 002_add_intelligence_features
-- Date: 2026-02-11
-- Description: Add Phase 2 intelligence tables for competitor tracking,
--              pattern detection, staff mentions, photo reviews, ranking history,
--              and weekly digests.

-- ========================================
-- COMPETITORS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS competitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    competitor_place_id TEXT NOT NULL,
    competitor_name TEXT NOT NULL,
    distance_miles DECIMAL(4,2),
    review_count INTEGER DEFAULT 0,
    rating DECIMAL(2,1),
    last_checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- PATTERNS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    pattern_type TEXT NOT NULL, -- 'complaint', 'praise', 'dish_mention'
    pattern_text TEXT NOT NULL,
    mention_count INTEGER DEFAULT 1,
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT DEFAULT 'active' -- 'active', 'resolved', 'dismissed'
);

-- ========================================
-- STAFF MENTIONS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS staff_mentions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    staff_name TEXT NOT NULL,
    mention_count INTEGER DEFAULT 1,
    positive_count INTEGER DEFAULT 0,
    negative_count INTEGER DEFAULT 0,
    last_mentioned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- PHOTO REVIEWS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS photo_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    photo_urls TEXT[],
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- RANKING HISTORY TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS ranking_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    position INTEGER,
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- WEEKLY DIGESTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS weekly_digests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    digest_data JSONB NOT NULL,
    sms_sent BOOLEAN DEFAULT FALSE,
    email_sent BOOLEAN DEFAULT FALSE,
    magic_link_token TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========================================
-- INDEXES
-- ========================================
CREATE INDEX IF NOT EXISTS idx_competitors_restaurant ON competitors(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_patterns_restaurant ON patterns(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_mentions_restaurant ON staff_mentions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_photo_reviews_restaurant ON photo_reviews(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_ranking_history_restaurant ON ranking_history(restaurant_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_digests_restaurant ON weekly_digests(restaurant_id, week_start DESC);

-- ========================================
-- COMMENTS
-- ========================================
COMMENT ON TABLE competitors IS 'Tracked competitor restaurants for intelligence features';
COMMENT ON TABLE patterns IS 'Detected patterns in reviews: recurring complaints, praise, dish mentions';
COMMENT ON TABLE staff_mentions IS 'Staff member mentions extracted from reviews';
COMMENT ON TABLE photo_reviews IS 'Photos associated with reviews';
COMMENT ON TABLE ranking_history IS 'Historical keyword ranking positions for SEO tracking';
COMMENT ON TABLE weekly_digests IS 'Weekly intelligence digest reports sent to restaurant owners';
