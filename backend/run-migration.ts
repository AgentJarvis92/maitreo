/**
 * Run database migration
 */

import { readFileSync } from 'fs';
import { supabase } from './src/services/database.js';

async function runMigration() {
  console.log('🔄 Running database migration...\n');

  try {
    const sql = readFileSync('./migrations/004_crisis_and_competitor_tables.sql', 'utf-8');
    
    // Split by semicolon and execute each statement
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      if (statement.includes('COMMENT ON')) continue; // Skip comments
      
      console.log(`Executing: ${statement.substring(0, 60)}...`);
      
      const { error } = await (supabase as any).rpc('exec_sql', { sql_query: statement });
      
      if (error) {
        console.error(`❌ Error: ${error.message}`);
        console.log('\n⚠️  Migration failed. Please run manually via Supabase SQL editor:');
        console.log('   1. Go to https://app.supabase.com');
        console.log('   2. Select your project');
        console.log('   3. Go to SQL Editor');
        console.log('   4. Paste the contents of migrations/004_crisis_and_competitor_tables.sql');
        console.log('   5. Run the query\n');
        process.exit(1);
      }
      
      console.log('✅');
    }

    console.log('\n✅ Migration completed successfully!');
  } catch (error: any) {
    console.error('❌ Migration error:', error.message);
    console.log('\n⚠️  Please run migration manually via Supabase SQL editor');
    console.log('   File: migrations/004_crisis_and_competitor_tables.sql');
    process.exit(1);
  }
}

runMigration();
