#!/usr/bin/env node
/**
 * Execute Maitreo database schema directly via Supabase
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  {
    db: {
      schema: 'public'
    }
  }
);

async function executeSchema() {
  console.log('🔧 Executing Maitreo database schema...\n');

  const schemaSQL = fs.readFileSync(__dirname + '/database/schema.sql', 'utf8');
  
  // Execute via Supabase REST API using raw SQL
  const { data, error } = await supabase.rpc('exec_sql', { sql: schemaSQL });
  
  if (error) {
    console.error('❌ Error executing schema:', error);
    
    // Try alternative: Execute statements one by one
    console.log('\n🔄 Trying statement-by-statement execution...\n');
    
    const statements = schemaSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      const preview = stmt.substring(0, 60).replace(/\n/g, ' ') + '...';
      process.stdout.write(`[${i+1}/${statements.length}] ${preview} `);
      
      const { error: stmtError } = await supabase.rpc('exec_sql', { sql: stmt });
      
      if (stmtError) {
        console.log(`❌ ${stmtError.message}`);
      } else {
        console.log('✅');
      }
    }
  } else {
    console.log('✅ Schema executed successfully!\n');
  }
  
  // Verify tables
  console.log('🔍 Verifying tables...');
  const tables = ['restaurants', 'reviews', 'sms_interactions', 'weekly_digests'];
  
  for (const table of tables) {
    const { error } = await supabase.from(table).select('id').limit(0);
    if (error) {
      console.log(`   ❌ ${table}: ${error.message}`);
    } else {
      console.log(`   ✅ ${table} exists`);
    }
  }
  
  console.log('\n✅ Database setup complete!');
}

executeSchema().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
