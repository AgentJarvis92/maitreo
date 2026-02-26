import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pool from './client.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
async function migrate() {
    console.log('🔄 Running database migration...');
    try {
        const schemaPath = join(__dirname, 'schema.sql');
        const schema = await readFile(schemaPath, 'utf-8');
        await pool.query(schema);
        console.log('✅ Migration completed successfully!');
        console.log('\nTables created:');
        console.log('  - restaurants');
        console.log('  - reviews');
        console.log('  - reply_drafts');
        console.log('  - newsletters');
        console.log('  - email_logs');
        console.log('\nViews created:');
        console.log('  - competitor_reviews_weekly');
    }
    catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
    finally {
        await pool.end();
    }
}
// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    migrate().catch(console.error);
}
export default migrate;
//# sourceMappingURL=migrate.js.map