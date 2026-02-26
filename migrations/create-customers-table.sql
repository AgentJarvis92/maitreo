-- Create customers table for Phase 1 onboarding
-- This table stores post-payment customer data and OAuth tokens

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Customer identification
    stripe_customer_id VARCHAR(255) UNIQUE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    
    -- Onboarding form data
    restaurant_name VARCHAR(255),
    location_address VARCHAR(255),
    phone_number VARCHAR(20),
    email VARCHAR(255) NOT NULL,
    
    -- Google OAuth
    google_email VARCHAR(255),
    google_location_id VARCHAR(255),
    google_location_name VARCHAR(255),
    google_refresh_token_encrypted VARCHAR(1000),
    google_connected BOOLEAN DEFAULT FALSE,
    google_connected_at TIMESTAMP WITH TIME ZONE,
    
    -- Status tracking
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_amount INTEGER,
    payment_date TIMESTAMP WITH TIME ZONE,
    
    onboarding_status VARCHAR(50) DEFAULT 'not_started',
    onboarding_completed_at TIMESTAMP WITH TIME ZONE,
    
    google_status VARCHAR(50) DEFAULT 'not_connected',
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_customers_stripe_customer_id ON customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_session_id ON customers(session_id);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_payment_status ON customers(payment_status);
CREATE INDEX IF NOT EXISTS idx_customers_onboarding_status ON customers(onboarding_status);
CREATE INDEX IF NOT EXISTS idx_customers_google_status ON customers(google_status);

-- Add customer_id to reviews table if it doesn't exist
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews(customer_id);

-- Create trigger for updated_at if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;

CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Verify creation
SELECT 
    'Customers table created successfully' AS status,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'customers') AS table_exists;
