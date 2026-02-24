-- Maitreo Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Restaurants table
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_name TEXT NOT NULL,
    business_address TEXT NOT NULL,
    owner_name TEXT NOT NULL,
    owner_email TEXT NOT NULL,
    owner_phone TEXT NOT NULL,
    
    -- Google OAuth
    google_location_name TEXT, -- Format: accounts/{accountId}/locations/{locationId}
    google_refresh_token TEXT, -- Encrypted
    google_connected_at TIMESTAMP WITH TIME ZONE,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending', -- pending, active, paused, cancelled
    subscription_status TEXT, -- trialing, active, past_due, cancelled
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    
    -- Polling metadata
    last_polled_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    
    -- Google review data
    google_review_id TEXT NOT NULL UNIQUE,
    reviewer_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    
    -- Classification
    sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'negative')),
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending_review', -- pending_review, approved, ignored, posted
    
    -- AI response
    ai_response TEXT, -- Generated response
    final_response TEXT, -- User-edited response (if edited)
    posted_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    create_time TIMESTAMP WITH TIME ZONE NOT NULL, -- From Google
    update_time TIMESTAMP WITH TIME ZONE NOT NULL, -- From Google
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SMS interactions table (for tracking user commands)
CREATE TABLE sms_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
    
    -- SMS data
    from_phone TEXT NOT NULL,
    to_phone TEXT NOT NULL,
    body TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    
    -- Parsed command (for inbound)
    command TEXT, -- APPROVE, EDIT, IGNORE, STATUS, HELP, etc.
    
    -- Twilio metadata
    twilio_sid TEXT UNIQUE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Weekly digests table (track what was sent)
CREATE TABLE weekly_digests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    
    -- Date range
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    
    -- Digest data (JSON)
    data JSONB NOT NULL,
    
    -- Status
    sent_at TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_restaurants_status ON restaurants(status);
CREATE INDEX idx_restaurants_google_connected ON restaurants(google_refresh_token) WHERE google_refresh_token IS NOT NULL;
CREATE INDEX idx_reviews_restaurant_id ON reviews(restaurant_id);
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_create_time ON reviews(create_time DESC);
CREATE INDEX idx_sms_restaurant_id ON sms_interactions(restaurant_id);
CREATE INDEX idx_sms_created_at ON sms_interactions(created_at DESC);
CREATE INDEX idx_weekly_digests_restaurant_id ON weekly_digests(restaurant_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to tables
CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) - Optional but recommended
-- ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE sms_interactions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE weekly_digests ENABLE ROW LEVEL SECURITY;

-- Create policies as needed for your security requirements
