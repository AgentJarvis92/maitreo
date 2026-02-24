-- SMS & Response Posting tables for ReviewReply

-- Owner phone numbers on restaurants
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(20);

-- SMS message tracking
CREATE TABLE IF NOT EXISTS sms_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
    reply_draft_id UUID REFERENCES reply_drafts(id) ON DELETE SET NULL,
    phone_number VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    body TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'received')),
    twilio_sid VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_phone ON sms_messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_created_at ON sms_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sms_messages_reply_draft ON sms_messages(reply_draft_id);

-- Posted responses tracking
CREATE TABLE IF NOT EXISTS posted_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reply_draft_id UUID NOT NULL REFERENCES reply_drafts(id) ON DELETE CASCADE,
    review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    response_text TEXT NOT NULL,
    external_response_id VARCHAR(255),
    posted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_posted_responses_reply_draft ON posted_responses(reply_draft_id);
CREATE INDEX IF NOT EXISTS idx_posted_responses_review ON posted_responses(review_id);
CREATE INDEX IF NOT EXISTS idx_posted_responses_platform ON posted_responses(platform);

-- Sentiment column on reviews
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sentiment VARCHAR(20);
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sentiment_score NUMERIC(4,2);
