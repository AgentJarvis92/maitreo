-- SMS A2P 10DLC Consent Tracking
-- Add consent logging fields to customers table for regulatory compliance

ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT FALSE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_consent_timestamp TIMESTAMP WITH TIME ZONE;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_consent_ip VARCHAR(45);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_consent_version VARCHAR(20);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_consent_source VARCHAR(100);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_consent_user_agent TEXT;

CREATE TABLE IF NOT EXISTS sms_consent_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    consent_given BOOLEAN NOT NULL,
    consent_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    consent_version VARCHAR(20),
    consent_source VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_sms_consent_audit_customer_id ON sms_consent_audit(customer_id);
CREATE INDEX idx_sms_consent_audit_timestamp ON sms_consent_audit(consent_timestamp);
CREATE INDEX idx_sms_consent_audit_consent_given ON sms_consent_audit(consent_given);

CREATE TRIGGER update_sms_consent_audit_updated_at
    BEFORE UPDATE ON sms_consent_audit
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
