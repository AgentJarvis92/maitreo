import { parseCommand } from '../sms/commandParser.js';
function assert(condition, msg) {
    if (!condition) {
        console.error(`❌ FAIL: ${msg}`);
        process.exit(1);
    }
    console.log(`✅ ${msg}`);
}
// Basic commands
assert(parseCommand('APPROVE').type === 'APPROVE', 'APPROVE');
assert(parseCommand('approve').type === 'APPROVE', 'approve lowercase');
assert(parseCommand('  Approve  ').type === 'APPROVE', 'APPROVE with whitespace');
assert(parseCommand('EDIT').type === 'EDIT', 'EDIT');
assert(parseCommand('IGNORE').type === 'IGNORE', 'IGNORE');
assert(parseCommand('PAUSE').type === 'PAUSE', 'PAUSE');
assert(parseCommand('RESUME').type === 'RESUME', 'RESUME');
assert(parseCommand('STATUS').type === 'STATUS', 'STATUS');
assert(parseCommand('BILLING').type === 'BILLING', 'BILLING');
assert(parseCommand('CANCEL').type === 'CANCEL', 'CANCEL');
assert(parseCommand('HELP').type === 'HELP', 'HELP');
assert(parseCommand('STOP').type === 'STOP', 'STOP');
// Fuzzy
assert(parseCommand('APROVE').type === 'APPROVE', 'fuzzy APROVE');
assert(parseCommand('hlep').type === 'HELP', 'fuzzy hlep');
assert(parseCommand('cancle').type === 'CANCEL', 'fuzzy cancle');
// Unknown
assert(parseCommand('hello there').type === 'UNKNOWN', 'unknown command');
assert(parseCommand('YES').type === 'UNKNOWN', 'YES outside cancel flow');
// Context: waiting_for_custom_reply
assert(parseCommand('My custom reply text', 'waiting_for_custom_reply').type === 'CUSTOM_REPLY', 'custom reply in edit flow');
assert(parseCommand('My custom reply text', 'waiting_for_custom_reply').body === 'My custom reply text', 'custom reply body preserved');
assert(parseCommand('HELP', 'waiting_for_custom_reply').type === 'HELP', 'HELP overrides edit flow');
// Context: waiting_for_cancel_confirm
assert(parseCommand('YES', 'waiting_for_cancel_confirm').type === 'CANCEL_CONFIRM', 'YES in cancel flow');
assert(parseCommand('no', 'waiting_for_cancel_confirm').type === 'CANCEL_DENY', 'NO in cancel flow');
assert(parseCommand('maybe', 'waiting_for_cancel_confirm').type === 'CANCEL_DENY', 'random in cancel flow = deny');
console.log('\n🎉 All command parser tests passed!');
//# sourceMappingURL=commandParser.test.js.map