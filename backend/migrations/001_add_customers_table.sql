-- Add customers table for post-payment onboarding
-- Run this migration to set up Phase 1 onboarding

ALTER TABLE restaurants RENAME TO restaurant_config;

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Customer identification
    stripe_customer_id VARCHAR(255) UNIQUE,
    session_id VARCHAR(255) UNIQUE, -- From Stripe payment success
    
    -- Onboarding form data
    restaurant_name VARCHAR(255) NOT NULL,
    location_address VARCHAR(255),
    phone_number VARCHAR(20), -- For SMS notifications
    email VARCHAR(255) NOT NULL,
    
    -- Google OAuth
    google_email VARCHAR(255),
    google_location_id VARCHAR(255),
    google_location_name VARCHAR(255), -- Format: accounts/{accountId}/locations/{locationId}
    google_refresh_token_encrypted VARCHAR(1000), -- Encrypted refresh token
    google_connected BOOLEAN DEFAULT FALSE,
    google_connected_at TIMESTAMP WITH TIME ZONE,
    
    -- Status tracking
    payment_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'failed'
    payment_amount INTEGER, -- In cents
    payment_date TIMESTAMP WITH TIME ZONE,
    
    onboarding_status VARCHAR(50) DEFAULT 'not_started', -- 'not_started', 'in_progress', 'completed'
    onboarding_completed_at TIMESTAMP WITH TIME ZONE,
    
    google_status VARCHAR(50) DEFAULT 'not_connected', -- 'not_connected', 'in_progress', 'connected'
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_customers_stripe_customer_id ON customers(stripe_customer_id);
CREATE INDEX idx_customers_session_id ON customers(session_id);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_payment_status ON customers(payment_status);
CREATE INDEX idx_customers_onboarding_status ON customers(onboarding_status);
CREATE INDEX idx_customers_google_status ON customers(google_status);

-- Trigger for updated_at
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add google_location_id to restaurant_config
ALTER TABLE restaurant_config ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX idx_restaurant_config_customer_id ON restaurant_config(customer_id);
