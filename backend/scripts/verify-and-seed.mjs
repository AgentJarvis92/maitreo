import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://cykzsgignbifzjavzcbo.supabase.co';
const serviceRoleKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN5a3pzZ2lnbmJpZnpqYXZ6Y2JvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDgyMzY5NiwiZXhwIjoyMDg2Mzk5Njk2fQ.iqYUMnqGCo50Bd7q1DbPbhod3M3gzq1HYyaqfPo9RXc';

const supabase = createClient(supabaseUrl, serviceRoleKey);

const tables = ['competitors', 'patterns', 'staff_mentions', 'photo_reviews', 'ranking_history', 'weekly_digests'];

console.log('=== Verifying Tables ===');
for (const table of tables) {
  const { error } = await supabase.from(table).select('id').limit(0);
  console.log(error ? `❌ ${table}: ${error.message}` : `✅ ${table}: exists`);
}

// Get a restaurant ID for sample data
const { data: restaurants } = await supabase.from('restaurants').select('id').limit(1);
if (!restaurants?.length) {
  console.log('\nNo restaurants found. Creating sample restaurant...');
  const { data: newR } = await supabase.from('restaurants').insert({
    name: 'Sample BBQ Pit',
    location: 'Atlanta, GA',
    owner_email: 'owner@samplebbq.com',
    google_place_id: 'ChIJSamplePlaceID123',
    tier: 'review_plus_intel'
  }).select().single();
  restaurants.push(newR);
}

const rid = restaurants[0].id;
console.log(`\nUsing restaurant: ${rid}`);

console.log('\n=== Inserting Sample Data ===');

const { error: e1 } = await supabase.from('competitors').insert({
  restaurant_id: rid, competitor_place_id: 'ChIJxxx123', competitor_name: 'Ribs & More BBQ',
  distance_miles: 1.2, review_count: 245, rating: 4.3
});
console.log(e1 ? `❌ competitors: ${e1.message}` : '✅ competitors: inserted');

const { error: e2 } = await supabase.from('patterns').insert({
  restaurant_id: rid, pattern_type: 'complaint', pattern_text: 'slow service on weekends',
  mention_count: 5, status: 'active'
});
console.log(e2 ? `❌ patterns: ${e2.message}` : '✅ patterns: inserted');

const { error: e3 } = await supabase.from('staff_mentions').insert({
  restaurant_id: rid, staff_name: 'Maria', mention_count: 8, positive_count: 7, negative_count: 1
});
console.log(e3 ? `❌ staff_mentions: ${e3.message}` : '✅ staff_mentions: inserted');

const { error: e4 } = await supabase.from('ranking_history').insert({
  restaurant_id: rid, keyword: 'best bbq atlanta', position: 3
});
console.log(e4 ? `❌ ranking_history: ${e4.message}` : '✅ ranking_history: inserted');

const { error: e5 } = await supabase.from('weekly_digests').insert({
  restaurant_id: rid, week_start: '2026-02-03',
  digest_data: { total_reviews: 12, avg_rating: 4.2, top_complaint: 'wait times', top_praise: 'brisket quality' }
});
console.log(e5 ? `❌ weekly_digests: ${e5.message}` : '✅ weekly_digests: inserted');

// Test FK constraint
console.log('\n=== Testing FK Constraints ===');
const { error: fkErr } = await supabase.from('competitors').insert({
  restaurant_id: '00000000-0000-0000-0000-000000000000', competitor_place_id: 'test', competitor_name: 'test'
});
console.log(fkErr ? '✅ FK constraint working (rejected invalid restaurant_id)' : '❌ FK constraint NOT working');

// Verify data
console.log('\n=== Verifying Data ===');
for (const table of tables) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) console.log(`❌ ${table}: ${error.message}`);
  else console.log(`✅ ${table}: ${data.length} rows`);
}

console.log('\n🎉 All done!');
