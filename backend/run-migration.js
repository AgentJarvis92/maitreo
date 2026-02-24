const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  'https://cykzsgignbifzjavzcbo.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5a3pzZ2lnbmJpZnpqYXZ6Y2JvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDgyMzY5NiwiZXhwIjoyMDg2Mzk5Njk2fQ.iqYUMnqGCo50Bd7q1DbPbhod3M3gzq1HYyaqfPo9RXc'
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
