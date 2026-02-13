-- Add Google OAuth token columns to restaurants table
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_access_token TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS google_account_id VARCHAR(255);

-- Add posted_responses table if not exists
CREATE TABLE IF NOT EXISTS posted_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reply_draft_id UUID REFERENCES reply_drafts(id) ON DELETE SET NULL,
    review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
    platform VARCHAR(50) NOT NULL,
    response_text TEXT NOT NULL,
    external_response_id VARCHAR(500),
    posted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posted_responses_review_id ON posted_responses(review_id);
CREATE INDEX IF NOT EXISTS idx_posted_responses_platform ON posted_responses(platform);

COMMENT ON COLUMN restaurants.google_access_token IS 'AES-256-GCM encrypted OAuth access token';
COMMENT ON COLUMN restaurants.google_refresh_token IS 'AES-256-GCM encrypted OAuth refresh token';
COMMENT ON COLUMN restaurants.google_token_expires_at IS 'When the access token expires';
COMMENT ON COLUMN restaurants.google_account_id IS 'Google Business account resource name (e.g., accounts/123)';
