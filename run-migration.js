const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://cykzsgignbifzjavzcbo.supabase.co',
  process.env.SUPABASE_SERVICE_KEY
);

async function runMigration() {
  const sql = fs.readFileSync('migrations/create-customers-table.sql', 'utf8');
  
  const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
  
  if (error) {
    console.error('Migration error:', error);
  } else {
    console.log('Migration successful:', data);
  }
}

runMigration();
