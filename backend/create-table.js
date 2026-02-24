const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://cykzsgignbifzjavzcbo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5a3pzZ2lnbmJpZnpqYXZ6Y2JvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDgyMzY5NiwiZXhwIjoyMDg2Mzk5Njk2fQ.iqYUMnqGCo50Bd7q1DbPbhod3M3gzq1HYyaqfPo9RXc'
);

async function createTable() {
  // First, create test customer with basic insert (table might exist)
  try {
    const { data, error } = await supabase.from('customers').insert({
      stripe_session_id: 'test_kevin_1',
      restaurant_name: 'Test Restaurant',
      location: 'New York, NY',
      phone: '+19173735394',
      email: 'reviewreplyhq@gmail.com',
      payment_status: 'completed',
      onboarding_status: 'pending_google',
      google_connection_status: 'pending'
    }).select();
    
    if (error) {
      console.log('Error (expected if table missing):', error.message);
      console.log('\nYou need to manually create the table in Supabase SQL Editor.');
      console.log('Go to: https://app.supabase.com → Maitreo project → SQL Editor');
      console.log('\nRun this SQL:\n');
      console.log(`CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_session_id VARCHAR(255) UNIQUE,
    restaurant_name VARCHAR(255),
    location VARCHAR(255),
    phone VARCHAR(20),
    email VARCHAR(255),
    google_refresh_token TEXT,
    payment_status VARCHAR(50) DEFAULT 'pending',
    onboarding_status VARCHAR(50) DEFAULT 'pending',
    google_connection_status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);`);
    } else {
      console.log('✅ Test customer created:', data);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

createTable();
