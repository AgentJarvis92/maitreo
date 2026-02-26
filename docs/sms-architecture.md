# Maitreo SMS Command System Architecture

## Overview

Maitreo is SMS-first with zero customer dashboard. All interactions happen via text message. This document defines the command parser, context tracking, and error handling strategy.

---

## Design Principles

1. **Self-contained messages** - Never assume the user has context
2. **Forgiving parser** - Handle typos, case variations, extra words
3. **Clear next steps** - Every message shows what to do next
4. **Friendly tone** - Casual, not corporate
5. **Mobile-first** - Short messages, easy to read on phone
6. **Always helpful** - Every message ends with "Reply HELP anytime."

---

## Command Parser Architecture

### Core Requirements

- Case-insensitive matching
- Fuzzy matching for common typos
- Multi-word command support (e.g., "EDIT make it friendlier")
- Contextual routing (match command to pending review)

### Parsing Pipeline

```
Incoming SMS
    ↓
1. NORMALIZE
   - Trim whitespace
   - Convert to uppercase
   - Remove extra spaces
    ↓
2. EXTRACT COMMAND
   - Get first word
   - Apply fuzzy matching
   - Map to canonical command
    ↓
3. EXTRACT ARGUMENTS
   - Everything after first word
   - Pass to command handler
    ↓
4. LOAD CONTEXT
   - Fetch active session for this phone number
   - Identify which review they're discussing
    ↓
5. VALIDATE
   - Does command require context? (APPROVE, EDIT, IGNORE do)
   - Is context valid? (review not already handled)
   - Is user allowed? (subscription active for most commands)
    ↓
6. EXECUTE
   - Call command handler with context + arguments
   - Update state
   - Send response SMS
    ↓
7. LOG & CLEANUP
   - Log command execution
   - Update session expiry
   - Cleanup expired sessions
```

### Command Matching Algorithm

**Exact match** (highest priority):
- APPROVE, EDIT, IGNORE, PAUSE, RESUME, STATUS, BILLING, CANCEL, HELP

**Fuzzy match** (Levenshtein distance ≤ 2):
- APROVE → APPROVE
- APRROVE → APPROVE
- APPROV → APPROVE
- EDUT → EDIT
- IGNOR → IGNORE
- PAUSE → PAUSE
- RESUNE → RESUME
- STATIS → STATUS
- BILLIG → BILLING
- CANCLE → CANCEL
- HLP → HELP

**Partial match** (starts with):
- APP... → APPROVE
- IGN... → IGNORE
- STAT... → STATUS
- BILL... → BILLING
- CAN... → CANCEL (careful: could be CANCEL or prefix of other words)

**Unknown command fallback**:
- Send HELP message with all commands

### Multi-Word Command Handling

Commands can have arguments after the first word:

```
APPROVE                  → Approve with default draft
APPROVE 1                → Approve review #1 (if multiple pending)
EDIT                     → Generic edit request
EDIT make it friendlier  → Specific edit instruction
EDIT shorter             → Specific edit instruction
IGNORE                   → Ignore this review
IGNORE 2                 → Ignore review #2
```

**Parsing logic:**
1. Split on whitespace
2. First word = command
3. Rest = arguments (joined back with spaces)
4. Pass arguments to command handler

---

## Context State Machine

### Session Object

Each phone number has an active session:

```json
{
  "phone_number": "+15551234567",
  "restaurant_id": "rest_xyz",
  "pending_reviews": [
    {
      "review_id": "rev_001",
      "platform": "google",
      "customer_name": "Sarah M.",
      "rating": 4,
      "text": "Great food, slow service",
      "draft_reply": "Thanks for the feedback, Sarah!...",
      "received_at": "2026-02-13T18:00:00Z",
      "notified_at": "2026-02-13T18:00:30Z",
      "expires_at": "2026-02-14T18:00:00Z"
    }
  ],
  "active_review_id": "rev_001",
  "paused_until": null,
  "last_interaction": "2026-02-13T18:05:00Z",
  "created_at": "2026-02-13T18:00:30Z"
}
```

### State Transitions

```
[New Review Arrives]
    ↓
Check if paused
    ↓ No
Create/Update Session
    ↓
Add to pending_reviews[]
Set active_review_id = this review
    ↓
Send notification SMS
    ↓
[Wait for command]
    ↓
    ├─ APPROVE → Post reply, remove from pending, set active to next or null
    ├─ EDIT → Send acknowledgment, keep in pending, wait for draft
    ├─ IGNORE → Remove from pending, set active to next or null
    ├─ PAUSE → Set paused_until, clear active_review_id
    ├─ RESUME → Clear paused_until
    ├─ STATUS → Show stats, don't change state
    ├─ BILLING → Show billing info, don't change state
    ├─ CANCEL → Initiate cancellation flow
    └─ HELP → Show commands, don't change state
```

### Context Resolution

**Single pending review:**
- Commands apply to that review
- No ambiguity

**Multiple pending reviews:**
- Most recent review is "active"
- User can specify: "APPROVE 1", "IGNORE 2"
- Numbers correspond to order in notification message

**No pending reviews:**
- Context-required commands (APPROVE, EDIT, IGNORE) → Error message
- Context-free commands (STATUS, BILLING, HELP) → Work normally

### Session Expiry

**Review expiry:** 24 hours from notification
- After 24h, review removed from pending_reviews[]
- User can no longer APPROVE/EDIT/IGNORE it
- Prevents stale actions on old reviews

**Session cleanup:** 7 days of inactivity
- If no interaction for 7 days, delete entire session
- Saves database space
- Next review creates fresh session

---

## Error Handling Strategy

### Review Already Handled

**Scenario:** User tries to APPROVE a review that was already approved/ignored

**Response:**
```
That review has already been handled. 

Current pending reviews: 0

Reply STATUS to check your account.

Reply HELP anytime.
```

### Context Lost (Review Too Old)

**Scenario:** User tries to APPROVE but review expired (24h+)

**Response:**
```
That review is no longer available (expired after 24h). 

If you need to reply manually, visit your Google/Yelp dashboard.

Current pending reviews: 0

Reply HELP anytime.
```

### No Active Context

**Scenario:** User sends APPROVE but has no pending reviews

**Response:**
```
No pending reviews right now. 

You'll get a text when a new review comes in.

Reply STATUS to check your account.

Reply HELP anytime.
```

### Multiple Reviews (Ambiguous)

**Scenario:** User has 3 pending reviews, sends "APPROVE" without number

**Strategy:** Apply to most recent (active_review_id)

**Response:**
```
✅ Approved and posted reply to Sarah M.'s review.

You have 2 more pending reviews. Check your next message.

Reply HELP anytime.
```

**Then immediately send next review notification.**

### Twilio Send Failure

**Strategy:**
1. Retry 3 times with exponential backoff (1s, 5s, 15s)
2. If all fail, log error and alert via Slack/email
3. Don't lose the review - keep in pending queue
4. Try again on next heartbeat (every 5 min)

**User impact:** None if retry succeeds within 30s

### Rate Limiting

**Problem:** Multiple reviews arrive within seconds

**Strategy:**
1. Send first review immediately
2. Queue subsequent reviews
3. Send next review only after:
   - User handles current review (APPROVE/IGNORE/EDIT), OR
   - 5 minutes pass (auto-escalate next review)

**Example flow:**
```
18:00 - Review 1 arrives → Send notification
18:01 - Review 2 arrives → Add to queue, don't send yet
18:02 - Review 3 arrives → Add to queue, don't send yet
18:03 - User sends APPROVE → Send Review 2 notification
18:04 - User sends IGNORE → Send Review 3 notification
```

**Benefit:** Doesn't overwhelm user with rapid-fire notifications

### Unknown Command

**Scenario:** User sends "HELLO" or "YES" or garbage text

**Response:**
```
I didn't recognize that command.

Available commands:
APPROVE - Post the reply
EDIT - Request changes
IGNORE - Skip this review
STATUS - Check account
HELP - Show all commands

Reply HELP for full list.

Reply HELP anytime.
```

### Subscription Expired

**Scenario:** User tries to APPROVE but subscription cancelled

**Response:**
```
Your subscription is inactive. 

To reactivate, reply BILLING for payment link.

Questions? We're here to help.

Reply HELP anytime.
```

**Exception:** BILLING and HELP commands always work, even if subscription inactive

---

## Security & Validation

### Phone Number Verification

- Only phone numbers in database (matched to restaurant) can send commands
- Unknown numbers get: "This number isn't registered. Visit maitreo.com to sign up."

### Review Ownership

- Verify review belongs to restaurant before executing command
- Prevents cross-restaurant actions if phones were ever mixed up

### Idempotency

- Each command execution gets a unique ID
- If duplicate SMS received (Twilio retry), check if already executed
- Don't double-post replies

### Input Sanitization

- EDIT arguments are user-provided text
- Must sanitize before passing to AI (no prompt injection)
- Limit length (max 500 chars for EDIT instructions)

---

## Command Reference

| Command | Context Required? | Subscription Required? | Arguments |
|---------|-------------------|------------------------|-----------|
| APPROVE | Yes (pending review) | Yes | Optional: review number |
| EDIT | Yes (pending review) | Yes | Optional: edit instructions |
| IGNORE | Yes (pending review) | Yes | Optional: review number |
| PAUSE | No | Yes | Optional: duration (default 24h) |
| RESUME | No | Yes | None |
| STATUS | No | No | None |
| BILLING | No | No | None |
| CANCEL | No | No | None (starts flow) |
| HELP | No | No | None |

---

## Performance Considerations

### Database Queries

- Index on `phone_number` for fast session lookup
- Index on `expires_at` for cleanup job
- Index on `restaurant_id` for multi-location support

### Caching

- Keep active sessions in Redis (TTL = 24h)
- Avoid database hit on every SMS
- Write-through cache (update DB + Redis on state change)

### Background Jobs

- **Session cleanup:** Cron job every hour, delete expired sessions
- **Review expiry:** Cron job every 15 min, remove expired reviews from pending
- **Retry failed SMS:** Cron job every 5 min, retry queued messages

---

## Testing Strategy

### Unit Tests

- Command parser (exact match, fuzzy match, unknown)
- Context resolution (single, multiple, none)
- Error handlers (expired, handled, no context)

### Integration Tests

- Full flow: review arrives → SMS sent → user approves → reply posted
- Multi-review flow
- PAUSE → new review → no SMS → RESUME → SMS sent

### Load Tests

- 100 reviews arrive in 1 minute (queue properly)
- 1000 concurrent SMS (Twilio rate limits)

### Manual QA

- Real phone, real Twilio number
- Test every command
- Test typos, case variations
- Test edge cases (expired, multiple reviews)

---

## Metrics & Monitoring

### Track These

- Command usage (which commands most popular?)
- Response time (review → notification → action)
- Error rate (Twilio failures, expired reviews)
- Average pending reviews per session
- PAUSE usage (are users overwhelmed?)

### Alerts

- Twilio send failure rate > 5%
- Pending review count > 10 for single user (backlog building)
- No SMS sent in 24h (system down?)

---

## Future Enhancements (Post-MVP)

- **Smart EDIT:** "EDIT make it shorter" → AI automatically adjusts
- **Scheduled replies:** "APPROVE at 9am tomorrow"
- **Bulk actions:** "APPROVE ALL"
- **Custom auto-replies:** "PAUSE and auto-approve 5-star reviews"
- **Rich media:** MMS support for review photos
- **Multi-language:** Spanish, French, etc.

---

## Implementation Notes

**Phase 3 will implement:**
1. Command parser function (~/restaurant-saas/services/sms/parser.js)
2. Session manager (~/restaurant-saas/services/sms/session.js)
3. Command handlers (~/restaurant-saas/services/sms/commands/*.js)
4. Twilio webhook endpoint (POST /api/sms/webhook)
5. Background jobs (cleanup, retry)

**Database schema:**
- `sms_sessions` table (stores session objects)
- `sms_logs` table (audit trail of every SMS)

**Dependencies:**
- Twilio SDK (sending SMS)
- Redis (session caching)
- PostgreSQL (persistent storage)

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-13  
**Author:** Subagent (maitreo-sms-design)
