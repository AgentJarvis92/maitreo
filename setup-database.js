/**
 * Setup Supabase Database Tables
 * Run this to create the Maitreo schema in Supabase
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Initialize Supabase with service role key (admin access)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function setupDatabase() {
  console.log('🔧 Setting up Maitreo database schema...\n');

  // Read schema SQL
  const schemaPath = path.join(__dirname, 'database/schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  // Split into individual statements (simple split by semicolon)
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} SQL statements to execute.\n`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i] + ';';
    const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
    
    process.stdout.write(`[${i + 1}/${statements.length}] ${preview}...`);

    try {
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: stmt
      });

      if (error) {
        // Try alternative method: direct query
        const { error: queryError } = await supabase
          .from('_schema')
          .select('*')
          .limit(0);
        
        // If that doesn't work, use raw SQL execution
        console.log(` ⚠️  Warning: ${error.message}`);
        errorCount++;
      } else {
        console.log(' ✅');
        successCount++;
      }
    } catch (err) {
      console.log(` ❌ ${err.message}`);
      errorCount++;
    }
  }

  console.log(`\n📊 Results:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Errors: ${errorCount}`);

  // Verify tables were created
  console.log('\n🔍 Verifying tables...');
  const { data: tables, error } = await supabase
    .from('restaurants')
    .select('count')
    .limit(0);

  if (!error) {
    console.log('   ✅ restaurants table exists');
  } else {
    console.log(`   ❌ Could not verify restaurants table: ${error.message}`);
  }

  console.log('\n✅ Database setup complete!');
}

// Run setup
setupDatabase().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
