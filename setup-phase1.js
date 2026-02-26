#!/usr/bin/env node

/**
 * Phase 1 Database Setup
 * Creates the customers table and schema for post-payment onboarding
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function setupDatabase() {
  console.log('🚀 Setting up Maitreo Phase 1 Database Schema...\n');

  try {
    // Create customers table
    console.log('📋 Creating customers table...');
    
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create customers table if it doesn't exist
        CREATE TABLE IF NOT EXISTS customers (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            
            -- Customer identification
            stripe_customer_id VARCHAR(255) UNIQUE,
            session_id VARCHAR(255) UNIQUE,
            
            -- Onboarding form data
            restaurant_name VARCHAR(255),
            location_address VARCHAR(255),
            phone_number VARCHAR(20),
            email VARCHAR(255),
            
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

        -- Update reviews table to support customer_id
        ALTER TABLE reviews ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews(customer_id);
      `
    });

    if (error) {
      console.error('❌ Error setting up schema:', error);
      return false;
    }

    console.log('✅ Database schema created successfully\n');

    // Verify tables exist
    console.log('🔍 Verifying tables...');
    const { data: tables, error: verifyError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');

    if (verifyError) {
      console.log('⚠️  Could not verify tables (might be normal)', verifyError.message);
    } else {
      console.log('✅ Tables verified\n');
    }

    // Test by querying customers table
    console.log('🧪 Testing customers table...');
    const { error: testError } = await supabase
      .from('customers')
      .select('*')
      .limit(1);

    if (testError) {
      console.error('❌ Error testing customers table:', testError);
      return false;
    }

    console.log('✅ Customers table is working\n');

    // Print summary
    console.log('═══════════════════════════════════════════');
    console.log('✅ Phase 1 Database Setup Complete!');
    console.log('═══════════════════════════════════════════\n');
    console.log('Ready for:");
    console.log('  1. Stripe payment webhook → create customer');
    console.log('  2. Onboarding form submission');
    console.log('  3. Google OAuth flow');
    console.log('  4. Review fetching and storage');
    console.log('\nEndpoints:');
    console.log('  POST   /api/stripe/webhook');
    console.log('  GET    /api/onboarding/form/:sessionId');
    console.log('  POST   /api/onboarding/form');
    console.log('  GET    /api/google/auth?sessionId=...');
    console.log('  GET    /api/google/callback');
    console.log('  GET    /api/reviews/fetch/:sessionId');
    console.log('  GET    /api/reviews/list/:sessionId\n');

    return true;

  } catch (error) {
    console.error('❌ Setup failed:', error);
    return false;
  }
}

// Run setup
setupDatabase().then(success => {
  process.exit(success ? 0 : 1);
});
