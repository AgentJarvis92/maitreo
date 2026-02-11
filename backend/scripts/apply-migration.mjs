import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const supabaseUrl = 'https://cykzsgignbifzjavzcbo.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5a3pzZ2lnbmJpZnpqYXZ6Y2JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzkyMjMzNjYsImV4cCI6MjA1NDc5OTM2Nn0.8y-tqJ7wvMJQk9QN_B2KqX1zCXg_Xw9Rr8Yy5n3Vx0M';

// Try using the Supabase SQL HTTP endpoint directly
const sqlFile = path.join(__dirname, '../migrations/002_add_intelligence_features.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

// Use fetch to hit the pg REST endpoint
const resp = await fetch(`${supabaseUrl}/rest/v1/rpc/`, {
  method: 'POST',
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({})
});

console.log('Checking if we can use RPC...');

// The anon key can't run DDL. Let's check if supabase CLI is available
import { execSync } from 'child_process';

try {
  execSync('which supabase', { stdio: 'pipe' });
  console.log('Supabase CLI found! Applying migration...');
  execSync(`supabase db push`, { cwd: path.join(__dirname, '..'), stdio: 'inherit' });
} catch {
  console.log('Supabase CLI not found. Applying via direct PostgreSQL connection...');
  
  // Try to get the database URL from supabase settings
  // For now, let's use the Supabase Management API
  // We need the service_role key or database password
  
  // Check if npx supabase works
  try {
    const result = execSync('npx supabase --version 2>&1', { stdio: 'pipe', timeout: 30000 }).toString();
    console.log('npx supabase version:', result);
  } catch {
    console.log('\nCannot apply DDL with anon key. Options:');
    console.log('1. Go to Supabase Dashboard > SQL Editor and paste the migration');
    console.log('2. Install supabase CLI: npm i -g supabase');
    console.log('3. Add SUPABASE_SERVICE_ROLE_KEY to .env');
    console.log('\nMigration file: migrations/002_add_intelligence_features.sql');
    
    // Let's try the dashboard SQL editor API
    console.log('\nAttempting via Supabase Dashboard SQL API...');
  }
}

// Try to verify if tables already exist (maybe schema was already applied)
const supabase = createClient(supabaseUrl, supabaseKey);
const tables = ['competitors', 'patterns', 'staff_mentions', 'photo_reviews', 'ranking_history', 'weekly_digests'];

for (const table of tables) {
  const { error } = await supabase.from(table).select('id').limit(0);
  if (error) {
    console.log(`❌ ${table}: ${error.message}`);
  } else {
    console.log(`✅ ${table}: exists`);
  }
}
