import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const client = new pg.Client({
  host: 'aws-0-us-east-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.cykzsgignbifzjavzcbo',
  password: '0f3Je80jn6MIHXfq',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  await client.connect();
  console.log('✅ Connected to Supabase PostgreSQL');

  const sqlFile = path.join(__dirname, '../migrations/002_add_intelligence_features.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  try {
    await client.query(sql);
    console.log('✅ Migration applied successfully!');
  } catch (err) {
    console.error('Migration error:', err.message);
  }

  // Verify tables
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('competitors', 'patterns', 'staff_mentions', 'photo_reviews', 'ranking_history', 'weekly_digests')
    ORDER BY table_name
  `);

  console.log('\nVerification:');
  for (const row of rows) {
    console.log(`✅ ${row.table_name}`);
  }
  console.log(`\n${rows.length}/6 tables created`);

  // Verify indexes
  const { rows: indexes } = await client.query(`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
    AND indexname LIKE 'idx_%'
    AND indexname IN ('idx_competitors_restaurant', 'idx_patterns_restaurant', 'idx_staff_mentions_restaurant', 'idx_photo_reviews_restaurant', 'idx_ranking_history_restaurant', 'idx_weekly_digests_restaurant')
  `);
  console.log(`${indexes.length}/6 indexes created`);
  for (const idx of indexes) {
    console.log(`✅ ${idx.indexname}`);
  }

  // Insert sample data
  console.log('\nInserting sample data...');
  
  // Get sample restaurant ID
  const { rows: restaurants } = await client.query('SELECT id FROM restaurants LIMIT 1');
  if (restaurants.length === 0) {
    console.log('No restaurants found, skipping sample data');
    await client.end();
    return;
  }
  const rid = restaurants[0].id;

  // Get sample review ID
  const { rows: reviews } = await client.query('SELECT id FROM reviews LIMIT 1');
  const reviewId = reviews.length > 0 ? reviews[0].id : null;

  await client.query(`
    INSERT INTO competitors (restaurant_id, competitor_place_id, competitor_name, distance_miles, review_count, rating)
    VALUES ($1, 'ChIJxxx123', 'Ribs & More BBQ', 1.2, 245, 4.3)
    ON CONFLICT DO NOTHING
  `, [rid]);
  console.log('✅ competitors: sample inserted');

  await client.query(`
    INSERT INTO patterns (restaurant_id, pattern_type, pattern_text, mention_count, status)
    VALUES ($1, 'complaint', 'slow service on weekends', 5, 'active')
    ON CONFLICT DO NOTHING
  `, [rid]);
  console.log('✅ patterns: sample inserted');

  await client.query(`
    INSERT INTO staff_mentions (restaurant_id, staff_name, mention_count, positive_count, negative_count)
    VALUES ($1, 'Maria', 8, 7, 1)
    ON CONFLICT DO NOTHING
  `, [rid]);
  console.log('✅ staff_mentions: sample inserted');

  if (reviewId) {
    await client.query(`
      INSERT INTO photo_reviews (review_id, restaurant_id, photo_urls)
      VALUES ($1, $2, ARRAY['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'])
      ON CONFLICT DO NOTHING
    `, [reviewId, rid]);
    console.log('✅ photo_reviews: sample inserted');
  } else {
    console.log('⏭️ photo_reviews: skipped (no reviews)');
  }

  await client.query(`
    INSERT INTO ranking_history (restaurant_id, keyword, position)
    VALUES ($1, 'best bbq atlanta', 3)
    ON CONFLICT DO NOTHING
  `, [rid]);
  console.log('✅ ranking_history: sample inserted');

  await client.query(`
    INSERT INTO weekly_digests (restaurant_id, week_start, digest_data)
    VALUES ($1, '2026-02-03', '{"total_reviews": 12, "avg_rating": 4.2, "top_complaint": "wait times", "top_praise": "brisket quality"}')
    ON CONFLICT DO NOTHING
  `, [rid]);
  console.log('✅ weekly_digests: sample inserted');

  // Test FK constraints
  console.log('\nTesting FK constraints...');
  try {
    await client.query(`INSERT INTO competitors (restaurant_id, competitor_place_id, competitor_name) VALUES ('00000000-0000-0000-0000-000000000000', 'test', 'test')`);
    console.log('❌ FK constraint NOT working');
  } catch (err) {
    console.log('✅ FK constraint working (rejected invalid restaurant_id)');
  }

  // Test index performance
  console.log('\nTesting index usage...');
  const { rows: plan } = await client.query(`EXPLAIN SELECT * FROM patterns WHERE restaurant_id = $1 AND status = 'active'`, [rid]);
  const usesIndex = plan.some(r => r['QUERY PLAN'].includes('Index'));
  console.log(usesIndex ? '✅ Index scan used for patterns query' : '⚠️ Sequential scan (expected with little data)');

  await client.end();
  console.log('\n🎉 All done!');
}

main().catch(err => { console.error(err); process.exit(1); });
