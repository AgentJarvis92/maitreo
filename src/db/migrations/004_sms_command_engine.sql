-- SMS Command Engine tables
-- sms_logs: All SMS in/out logging
-- sms_context: Per-phone conversation state

CREATE TABLE IF NOT EXISTS sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_phone VARCHAR(20) NOT NULL,
  to_phone VARCHAR(20) NOT NULL,
  body TEXT NOT NULL,
  command_parsed VARCHAR(30),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  twilio_sid VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_from ON sms_logs(from_phone, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_twilio_sid ON sms_logs(twilio_sid) WHERE twilio_sid IS NOT NULL;

CREATE TABLE IF NOT EXISTS sms_context (
  phone VARCHAR(20) PRIMARY KEY,
  state VARCHAR(50), -- null, 'waiting_for_custom_reply', 'waiting_for_cancel_confirm'
  pending_review_id VARCHAR(100),
  restaurant_id UUID REFERENCES restaurants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add columns to restaurants if they don't exist
DO $$ BEGIN
  ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS monitoring_paused BOOLEAN DEFAULT false;
  ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN DEFAULT false;
EXCEPTION WHEN others THEN NULL;
END $$;
