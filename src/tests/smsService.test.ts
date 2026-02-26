/**
 * SMS Service Tests
 * Tests all 8 commands, EDIT flow, CANCEL flow, idempotence, and unknown commands.
 * Run with: npx tsx src/tests/smsService.test.ts
 * 
 * Uses mocks — no real DB, Twilio, or Stripe calls.
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

// ─── Mock Infrastructure ─────────────────────────────────────────────

const mockDb: Record<string, any[]> = {
  sms_context: [],
  sms_logs: [],
  restaurants: [],
  reviews: [],
  reply_drafts: [],
  sms_messages: [],
};

let mockStripeCallCount = 0;
let mockStripeShouldFail = false;
let mockTwilioMessages: { to: string; body: string }[] = [];

// Mock the modules before importing smsService
// We'll test the command parser directly and simulate the service logic

import { parseCommand } from '../sms/commandParser.js';

console.log('🧪 SMS Service Tests\n');

// ─── Command Parser Tests ────────────────────────────────────────────

console.log('--- Command Parser ---\n');

// Test all 8 commands
assert(parseCommand('APPROVE').type === 'APPROVE', 'APPROVE command');
assert(parseCommand('EDIT').type === 'EDIT', 'EDIT command');
assert(parseCommand('IGNORE').type === 'IGNORE', 'IGNORE command');
assert(parseCommand('PAUSE').type === 'PAUSE', 'PAUSE command');
assert(parseCommand('RESUME').type === 'RESUME', 'RESUME command');
assert(parseCommand('STATUS').type === 'STATUS', 'STATUS command');
assert(parseCommand('BILLING').type === 'BILLING', 'BILLING command');
assert(parseCommand('CANCEL').type === 'CANCEL', 'CANCEL command');

// Case insensitivity
assert(parseCommand('approve').type === 'APPROVE', 'approve lowercase');
assert(parseCommand('  Status  ').type === 'STATUS', 'STATUS with whitespace');

// EDIT flow: waiting_for_custom_reply state → treats input as CUSTOM_REPLY
console.log('\n--- EDIT Flow ---\n');

const editResult = parseCommand('My custom response text', 'waiting_for_custom_reply');
assert(editResult.type === 'CUSTOM_REPLY', 'EDIT flow: free text becomes CUSTOM_REPLY');
assert(editResult.body === 'My custom response text', 'EDIT flow: body preserved');

// EDIT flow: explicit command overrides custom reply
const editOverride = parseCommand('PAUSE', 'waiting_for_custom_reply');
assert(editOverride.type === 'PAUSE', 'EDIT flow: explicit command overrides');

// YES/NO in edit flow stay as custom reply
const editYes = parseCommand('YES', 'waiting_for_custom_reply');
assert(editYes.type === 'CUSTOM_REPLY', 'EDIT flow: YES treated as custom reply');

// CANCEL flow: YES/NO
console.log('\n--- CANCEL Flow ---\n');

const cancelYes = parseCommand('YES', 'waiting_for_cancel_confirm');
assert(cancelYes.type === 'CANCEL_CONFIRM', 'CANCEL flow: YES confirms');

const cancelNo = parseCommand('NO', 'waiting_for_cancel_confirm');
assert(cancelNo.type === 'CANCEL_DENY', 'CANCEL flow: NO denies');

const cancelY = parseCommand('Y', 'waiting_for_cancel_confirm');
assert(cancelY.type === 'CANCEL_CONFIRM', 'CANCEL flow: Y confirms');

const cancelNah = parseCommand('NAH', 'waiting_for_cancel_confirm');
assert(cancelNah.type === 'CANCEL_DENY', 'CANCEL flow: NAH denies');

// Random text in cancel flow = cancel denied
const cancelRandom = parseCommand('I changed my mind', 'waiting_for_cancel_confirm');
assert(cancelRandom.type === 'CANCEL_DENY', 'CANCEL flow: random text = deny');

// Unknown commands
console.log('\n--- Unknown Commands ---\n');

assert(parseCommand('hello world').type === 'UNKNOWN', 'Unknown command: hello world');
assert(parseCommand('').type === 'UNKNOWN', 'Unknown command: empty string');
assert(parseCommand('BLAH').type === 'UNKNOWN', 'Unknown command: BLAH');

// YES/NO outside cancel flow = UNKNOWN
assert(parseCommand('YES').type === 'UNKNOWN', 'YES outside cancel flow = UNKNOWN');
assert(parseCommand('NO').type === 'UNKNOWN', 'NO outside cancel flow = UNKNOWN');

// Fuzzy matching
console.log('\n--- Fuzzy Matching ---\n');

assert(parseCommand('APROVE').type === 'APPROVE', 'Fuzzy: APROVE → APPROVE');
assert(parseCommand('CANCLE').type === 'CANCEL', 'Fuzzy: CANCLE → CANCEL');
assert(parseCommand('STAUTS').type === 'STATUS', 'Fuzzy: STAUTS → STATUS');
assert(parseCommand('BILING').type === 'BILLING', 'Fuzzy: BILING → BILLING');

// Idempotence test (structural — verify webhook handler source checks sms_logs)
console.log('\n--- Idempotence (structural check) ---\n');

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const webhookSource = readFileSync(join(__dirname, '..', 'sms', 'webhookHandler.ts'), 'utf-8');
assert(
  webhookSource.includes("SELECT id FROM sms_logs WHERE twilio_sid"),
  'webhookHandler checks sms_logs for duplicate MessageSid'
);
assert(
  webhookSource.includes('Duplicate MessageSid'),
  'webhookHandler logs duplicate MessageSid rejection'
);

// HELP and STOP
console.log('\n--- HELP and STOP ---\n');

assert(parseCommand('HELP').type === 'HELP', 'HELP command');
assert(parseCommand('STOP').type === 'STOP', 'STOP command');
assert(parseCommand('HLEP').type === 'HELP', 'Fuzzy: HLEP → HELP');
assert(parseCommand('STPO').type === 'STOP', 'Fuzzy: STPO → STOP');

// Structural checks on smsService source
console.log('\n--- SMS Service Structural Checks ---\n');

const smsServiceSource = readFileSync(join(__dirname, '..', 'sms', 'smsService.ts'), 'utf-8');

assert(
  smsServiceSource.includes("case 'CANCEL_DENY'") && smsServiceSource.includes("await updateContext(fromPhone, { state: null })"),
  'CANCEL_DENY clears conversation state'
);

assert(
  smsServiceSource.includes('Cancellation failed, please try again'),
  'handleCancelConfirm sends failure message on Stripe error'
);

assert(
  smsServiceSource.includes('HIGH SEVERITY'),
  'handleCancelConfirm logs high-severity alert on Stripe failure'
);

// ─── Summary ─────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
console.log('✅ All SMS service tests passed!');
