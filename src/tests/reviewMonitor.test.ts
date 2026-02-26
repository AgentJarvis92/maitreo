/**
 * Review Monitor Tests
 * Tests dedup logic, paused restaurants, transaction rollback, SMS retry marking.
 * Run with: npx tsx src/tests/reviewMonitor.test.ts
 *
 * Tests command parser and structural checks — no real DB/API calls.
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    failed++;
  } else {
    console.log(`✅ ${msg}`);
    passed++;
  }
}

console.log('🧪 Review Monitor Tests\n');

// ─── Structural / Source-Level Tests ─────────────────────────────────
// We test by reading source files since pg module isn't available in test env

console.log('--- Module Structure ---\n');

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const monitorSource = readFileSync(join(__dirname, '..', 'jobs', 'reviewMonitor.ts'), 'utf-8');
const retrySource = readFileSync(join(__dirname, '..', 'jobs', 'smsRetry.ts'), 'utf-8');
const clientSource = readFileSync(join(__dirname, '..', 'db', 'client.ts'), 'utf-8');

assert(monitorSource.includes('export class ReviewMonitorJob'), 'ReviewMonitorJob class is exported');
assert(monitorSource.includes('async runOnce()'), 'ReviewMonitorJob has runOnce method');
assert(monitorSource.includes('async start()'), 'ReviewMonitorJob has start method');
assert(monitorSource.includes('stop()'), 'ReviewMonitorJob has stop method');
assert(retrySource.includes('export class SmsRetryJob'), 'SmsRetryJob class is exported');
assert(retrySource.includes('async run()'), 'SmsRetryJob has run method');
assert(clientSource.includes('export async function transaction'), 'transaction helper is exported');

// ─── Dedup Logic Test ────────────────────────────────────────────────

console.log('\n--- Dedup Logic (structural) ---\n');

assert(monitorSource.includes('reviewExists'), 'reviewExists method used for dedup');
assert(monitorSource.includes("SELECT COUNT(*) as count FROM reviews WHERE platform"), 'Dedup query checks platform + review_id');

// ─── Monitoring Paused Filter Test ───────────────────────────────────

console.log('\n--- Monitoring Paused Filter (structural) ---\n');

// The getRestaurants query includes WHERE monitoring_paused IS NOT TRUE
// This means paused restaurants are automatically excluded from polling
assert(
  monitorSource.includes('monitoring_paused IS NOT TRUE'),
  'getRestaurants query filters out paused restaurants'
);

// ─── Transaction Wrapping Test ───────────────────────────────────────

console.log('\n--- Transaction Wrapping (structural) ---\n');

assert(
  monitorSource.includes('await transaction(async (client)'),
  'processRestaurant uses transaction() for review + draft insert'
);

assert(
  monitorSource.includes("import { query, transaction } from '../db/client.js'"),
  'reviewMonitor imports transaction from db/client'
);
assert(clientSource.includes("await client.query('BEGIN')"), 'transaction does BEGIN');
assert(clientSource.includes("await client.query('COMMIT')"), 'transaction does COMMIT');
assert(clientSource.includes("await client.query('ROLLBACK')"), 'transaction does ROLLBACK on error');

// ─── SMS Retry Marking Test ─────────────────────────────────────────

console.log('\n--- SMS Retry Marking (structural) ---\n');

assert(
  monitorSource.includes('sms_alert_failed'),
  'SMS failure marks review with sms_alert_failed in metadata'
);

assert(
  retrySource.includes('MAX_ATTEMPTS'),
  'SMS retry job has MAX_ATTEMPTS constant'
);
assert(
  retrySource.includes('Math.pow(2,'),
  'SMS retry uses exponential backoff'
);
assert(
  retrySource.includes('"permanent"'),
  'SMS retry marks permanently failed after max attempts'
);

// ─── Pool Error Handling ─────────────────────────────────────────────

console.log('\n--- Pool Error Handling (structural) ---\n');

assert(
  !clientSource.includes('process.exit'),
  'pool.on(error) does NOT call process.exit'
);

assert(
  clientSource.includes("pool.query('SELECT 1')"),
  'pool.on(error) attempts reconnection'
);

// ─── Summary ─────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
console.log('✅ All review monitor tests passed!');
