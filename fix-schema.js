#!/usr/bin/env node
/**
 * Fix Maitreo database schema - execute raw SQL via Supabase REST API
 */

require('dotenv').config();
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Full schema SQL
const SCHEMA_SQL = `
-- Drop existing tables to recreate cleanly
DROP TABLE IF EXISTS weekly_digests CASCADE;
DROP TABLE IF EXISTS sms_interactions CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS restaurants CASCADE;

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
    google_location_name TEXT,
    google_refresh_token TEXT,
    google_connected_at TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'pending',
    subscription_status TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    last_polled_at TIMESTAMP WITH TIME ZONE,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Reviews table
CREATE TABLE reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    google_review_id TEXT NOT NULL UNIQUE,
    reviewer_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    sentiment TEXT NOT NULL CHECK (sentiment IN ('positive', 'negative')),
    status TEXT NOT NULL DEFAULT 'pending_review',
    ai_response TEXT,
    final_response TEXT,
    posted_at TIMESTAMP WITH TIME ZONE,
    create_time TIMESTAMP WITH TIME ZONE NOT NULL,
    update_time TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SMS interactions table
CREATE TABLE sms_interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    review_id UUID REFERENCES reviews(id) ON DELETE SET NULL,
    from_phone TEXT NOT NULL,
    to_phone TEXT NOT NULL,
    body TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    command TEXT,
    twilio_sid TEXT UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Weekly digests table
CREATE TABLE weekly_digests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    data JSONB NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_restaurants_status ON restaurants(status);
CREATE INDEX idx_restaurants_google_connected ON restaurants(google_refresh_token) WHERE google_refresh_token IS NOT NULL;
CREATE INDEX idx_reviews_restaurant_id ON reviews(restaurant_id);
CREATE INDEX idx_reviews_status ON reviews(status);
CREATE INDEX idx_reviews_create_time ON reviews(create_time DESC);
CREATE INDEX idx_sms_restaurant_id ON sms_interactions(restaurant_id);
CREATE INDEX idx_sms_created_at ON sms_interactions(created_at DESC);
CREATE INDEX idx_weekly_digests_restaurant_id ON weekly_digests(restaurant_id);

-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

function executeSQL(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL('/rest/v1/rpc/exec', SUPABASE_URL);
    
    const postData = JSON.stringify({ query: sql });
    
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

console.log('🔧 Fixing Maitreo database schema...\n');

// Execute via direct Postgres connection string
const { execSync } = require('child_process');
const fs = require('fs');

// Write SQL to temp file
const tmpFile = '/tmp/maitreo-schema.sql';
fs.writeFileSync(tmpFile, SCHEMA_SQL);

const DB_PASSWORD = "0f3Je80jn6MIHXfq";
const connString = `postgresql://postgres:${DB_PASSWORD}@db.cykzsgignbifzjavzcbo.supabase.co:5432/postgres`;

try {
  console.log('Executing schema via psql...\n');
  const output = execSync(`PGPASSWORD="${DB_PASSWORD}" psql "${connString}" -f "${tmpFile}"`, {
    encoding: 'utf8',
    stdio: 'pipe'
  });
  console.log(output);
  console.log('\n✅ Schema executed successfully!\n');
  
  // Verify
  console.log('🔍 Verifying tables...');
  const verify = execSync(`PGPASSWORD="${DB_PASSWORD}" psql "${connString}" -c "\\dt"`, {
    encoding: 'utf8'
  });
  console.log(verify);
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
} finally {
  fs.unlinkSync(tmpFile);
}
