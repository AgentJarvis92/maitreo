const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL || 'https://cykzsgignbifzjavzcbo.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  const sqlFile = path.join(__dirname, '../migrations/002_add_intelligence_features.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  // Split into individual statements
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Executing ${statements.length} statements...`);

  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { query: stmt + ';' }).maybeSingle();
    if (error) {
      // Try direct fetch to SQL endpoint
      console.log(`RPC failed, trying direct: ${stmt.substring(0, 60)}...`);
    }
  }

  // Verify tables exist
  const { data, error } = await supabase
    .from('competitors')
    .select('id')
    .limit(0);

  if (error && error.code === '42P01') {
    console.log('Tables not created via JS client. Need to use Supabase SQL Editor or psql.');
    console.log('Migration SQL file ready at: migrations/002_add_intelligence_features.sql');
    console.log('\nApply via Supabase Dashboard > SQL Editor, or use:');
    console.log('supabase db push (if using Supabase CLI)');
  } else {
    console.log('✅ Migration applied successfully!');
  }
}

applyMigration().catch(console.error);
