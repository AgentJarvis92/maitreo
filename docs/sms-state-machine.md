# Maitreo SMS Context State Machine

## Overview

This document defines how Maitreo tracks conversation context, manages sessions, and handles multiple pending reviews without overwhelming the user.

---

## Core Problem

**Challenge:** SMS is stateless, but our conversation is stateful.

- User: "APPROVE"
- System: "Which review? You have 3 pending."

**Solution:** Context tracking via session state.

---

## Session State Schema

Each phone number has ONE active session containing ALL context:

```javascript
{
  // Identity
  phone_number: "+15551234567",
  restaurant_id: "rest_abc123",
  
  // Review queue
  pending_reviews: [
    {
      review_id: "rev_001",
      platform: "google",
      platform_review_id: "ChZDSUhNMG9nS0VJ...",
      customer_name: "Sarah M.",
      rating: 4,
      review_text: "Great food, slow service",
      review_url: "https://g.page/...",
      draft_reply: "Thanks for the feedback, Sarah! We're glad...",
      draft_version: 1,
      received_at: "2026-02-13T18:00:00Z",
      notified_at: "2026-02-13T18:00:30Z",
      expires_at: "2026-02-14T18:00:30Z"  // 24h from notification
    }
    // ... more pending reviews
  ],
  
  // Current context
  active_review_id: "rev_001",  // Which review commands apply to
  active_review_index: 0,        // Position in pending_reviews array
  
  // Pause state
  paused_until: null,  // null = active, timestamp = paused
  
  // Metadata
  last_interaction: "2026-02-13T18:05:00Z",
  created_at: "2026-02-13T18:00:30Z",
  updated_at: "2026-02-13T18:05:00Z"
}
```

### Storage

- **Primary:** PostgreSQL `sms_sessions` table
- **Cache:** Redis with 24h TTL (hot path optimization)
- **Write strategy:** Write-through (update both on every change)

---

## State Lifecycle

### 1. Session Creation

**Trigger:** First review arrives for this phone number

```
[New Review Arrives]
    ↓
Check if session exists for phone_number
    ↓
    ├─ No → CREATE session
    │         - Set restaurant_id
    │         - Add review to pending_reviews[]
    │         - Set active_review_id
    │         - Set created_at, last_interaction
    │
    └─ Yes → LOAD session, continue to step 2
```

### 2. Review Addition

**Trigger:** New review arrives (session already exists)

```
[Session Exists]
    ↓
Check if paused_until
    ↓
    ├─ Paused → Add to pending_reviews[], DO NOT send notification
    │
    └─ Active → Add to pending_reviews[]
                  ↓
                Check pending_reviews.length
                  ↓
                  ├─ 1 review → Send immediately, set as active
                  │
                  └─ 2+ reviews → Queue it, send only if:
                                  - User just handled active review, OR
                                  - 5 minutes passed since last notification
```

**Queueing logic prevents spam:**
- Review 1 at 18:00 → Send immediately
- Review 2 at 18:01 → Queue (wait for user action)
- Review 3 at 18:02 → Queue
- User APPROVEs at 18:03 → Send Review 2
- User IGNOREs at 18:04 → Send Review 3

**Auto-escalation:** If 5 min pass with no action, send next review anyway.

### 3. Review Handling

**Trigger:** User sends APPROVE/EDIT/IGNORE

```
[Command Received]
    ↓
Parse command + optional review number
    ↓
    ├─ No number → Use active_review_id
    │
    └─ Has number → Resolve to review at index (number - 1)
          ↓
Validate review exists and not expired
    ↓
Execute action (approve/ignore/edit)
    ↓
Remove from pending_reviews[] if approved/ignored
    ↓
Update active_review_id:
    ├─ pending_reviews.length > 0 → Set to next review (index 0)
    └─ pending_reviews.length = 0 → Set to null
    ↓
Send confirmation message
    ↓
If more pending → Send next review notification
```

### 4. Session Expiry

**Trigger:** Background cleanup job (cron every 15 min)

```
[Cleanup Job Runs]
    ↓
For each session:
    ↓
    Check each pending_review.expires_at
        ↓
        ├─ Expired → Remove from pending_reviews[]
        │             Log expiry event
        │
        └─ Valid → Keep in queue
    ↓
    Check last_interaction
        ↓
        ├─ > 7 days ago AND pending_reviews.length = 0
        │   → DELETE entire session (no activity)
        │
        └─ Recent OR has pending → Keep session
```

**Why 24h review expiry?**
- Prevents acting on stale reviews (customer might have deleted it)
- Platforms may remove/hide old reviews
- Encourages timely responses

**Why 7-day session cleanup?**
- Saves database space
- If no reviews in a week, safe to delete
- Next review creates fresh session anyway

---

## Context Resolution Algorithm

### Single Pending Review

**State:**
```javascript
{
  pending_reviews: [review_001],
  active_review_id: "rev_001"
}
```

**User:** `APPROVE`

**Resolution:**
1. No ambiguity
2. Apply to active_review_id
3. Done ✓

---

### Multiple Pending Reviews (User Specifies)

**State:**
```javascript
{
  pending_reviews: [review_001, review_002, review_003],
  active_review_id: "rev_001"
}
```

**User:** `APPROVE 2`

**Resolution:**
1. Parse number: 2
2. Index = 2 - 1 = 1
3. pending_reviews[1] = review_002
4. Apply to review_002
5. Remove review_002
6. Renumber remaining reviews in notification

**User:** `IGNORE 3`

**Resolution:**
1. Parse number: 3
2. Index = 3 - 1 = 2
3. pending_reviews[2] = review_003
4. Ignore review_003
5. Remove from queue

---

### Multiple Pending Reviews (User Doesn't Specify)

**State:**
```javascript
{
  pending_reviews: [review_001, review_002, review_003],
  active_review_id: "rev_001"  // Most recently notified
}
```

**User:** `APPROVE`

**Resolution:**
1. No number provided
2. Default to active_review_id
3. Apply to review_001
4. Remove review_001
5. Set active_review_id = review_002
6. Send notification for review_002

**Rationale:** Assume user is responding to most recent message.

---

### No Pending Reviews

**State:**
```javascript
{
  pending_reviews: [],
  active_review_id: null
}
```

**User:** `APPROVE`

**Resolution:**
1. Check pending_reviews.length = 0
2. Return error: "No pending reviews"
3. Don't execute action

**User:** `STATUS`

**Resolution:**
1. Context-free command
2. Execute normally (show "0 pending")
3. Works fine ✓

---

### After PAUSE

**State:**
```javascript
{
  pending_reviews: [],
  active_review_id: null,
  paused_until: "2026-02-14T18:00:00Z"
}
```

**New Review Arrives:**
1. Add to pending_reviews[]
2. DO NOT send notification (paused)
3. DO NOT set active_review_id

**User:** `RESUME`

**Resolution:**
1. Clear paused_until
2. Check pending_reviews.length
3. If > 0, send first review notification
4. Set active_review_id

---

## Multi-Review Notification Strategy

### Problem

User has 5 pending reviews. If we send all 5 at once → overwhelming.

### Solution: Progressive Disclosure

**Send one at a time, with count:**

```
🌟 Review #1 at Tony's Pizza:

"Great food!" ⭐⭐⭐⭐⭐ - John D.

Draft reply:
"Thanks so much, John! We're thrilled you enjoyed it."

Reply:
APPROVE 1 - Post this reply
EDIT 1 - Request changes
IGNORE 1 - Don't reply

4 more pending.

Reply HELP anytime.
```

**After user handles it:**

```
✅ Reply posted to John D.'s review.

You have 3 more pending. Check your next message.

Reply HELP anytime.
```

**Then immediately send:**

```
🌟 Review #2 at Tony's Pizza:
...
```

**Benefits:**
- User sees one decision at a time
- Not overwhelmed
- Can process in order
- Always knows count remaining

---

## Edge Cases & Error States

### 1. Review Already Replied To

**Scenario:** User approves review, then tries to approve again (double-tap)

**Detection:**
- Check if review_id exists in pending_reviews[]
- If not → Already handled

**Response:**
```
That review has already been handled.

Current pending reviews: 2

Reply STATUS to check your account.

Reply HELP anytime.
```

### 2. Review Expired (24h+)

**Scenario:** User ignores notification, tries to approve 25h later

**Detection:**
- Background job removed from pending_reviews[] after 24h
- User command finds no matching review

**Response:**
```
That review is no longer available (expired after 24h).

To reply manually, visit your Google dashboard.

Current pending: 0

Reply HELP anytime.
```

### 3. Context Lost (Session Deleted)

**Scenario:** User inactive for 8 days, session deleted, then sends "APPROVE"

**Detection:**
- No session found for phone_number
- Context-requiring command received

**Response:**
```
No pending reviews right now.

You'll get a text when a new review arrives.

Reply STATUS to check your account.

Reply HELP anytime.
```

### 4. Out-of-Range Review Number

**Scenario:** User has 2 pending, sends "APPROVE 5"

**Detection:**
- Parse number: 5
- Check pending_reviews.length = 2
- 5 > 2 → Invalid

**Response:**
```
You only have 2 pending reviews.

Reply APPROVE (no number) for the most recent, or APPROVE 1 or APPROVE 2.

Reply HELP anytime.
```

### 5. Platform API Failure (Can't Post Reply)

**Scenario:** User approves, but Google API returns error

**State change:**
- DO NOT remove from pending_reviews[]
- Mark review.post_failed = true

**Response:**
```
We couldn't post your reply right now (Google API error).

We'll retry automatically. You can check status in a few minutes.

Reply STATUS to check account.

Reply HELP anytime.
```

**Background:** Retry job attempts every 5 min (3 attempts), then alerts admin.

---

## State Transition Diagram

```
┌─────────────────┐
│  No Session     │
└────────┬────────┘
         │
         │ (New Review)
         ↓
┌─────────────────┐
│ Active Session  │
│ 1 pending       │
└────────┬────────┘
         │
         ├─ (APPROVE) ──→ Remove from pending ──→ pending = 0 ──→ Wait for next review
         │
         ├─ (EDIT) ─────→ Keep in pending ──────→ Regenerate draft ──→ Re-notify
         │
         ├─ (IGNORE) ───→ Remove from pending ──→ pending = 0 ──→ Wait
         │
         ├─ (PAUSE) ────→ Set paused_until ─────→ Stop notifications
         │
         └─ (New Review) → Add to pending ──────→ Send notification
                              │
                              ↓
                    ┌─────────────────┐
                    │ Active Session  │
                    │ 2+ pending      │
                    └────────┬────────┘
                             │
                             ├─ (APPROVE) ──→ Remove #1 ──→ Send #2 notification
                             │
                             ├─ (IGNORE 2) ─→ Remove #2 ──→ Renumber
                             │
                             └─ (5 min pass) → Auto-send next review

┌─────────────────┐
│ Paused Session  │
└────────┬────────┘
         │
         ├─ (New Review) ──→ Add to pending (silent)
         │
         └─ (RESUME) ──────→ Clear paused_until ──→ Send first pending
```

---

## Implementation Checklist

### Database Schema

**Table: `sms_sessions`**
```sql
CREATE TABLE sms_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id),
  pending_reviews JSONB DEFAULT '[]'::jsonb,
  active_review_id VARCHAR(100),
  active_review_index INTEGER DEFAULT 0,
  paused_until TIMESTAMP,
  last_interaction TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_phone ON sms_sessions(phone_number);
CREATE INDEX idx_restaurant ON sms_sessions(restaurant_id);
CREATE INDEX idx_last_interaction ON sms_sessions(last_interaction);
```

**Table: `sms_logs`** (audit trail)
```sql
CREATE TABLE sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES sms_sessions(id),
  direction VARCHAR(10), -- 'inbound' or 'outbound'
  message_text TEXT,
  command VARCHAR(50),
  review_id VARCHAR(100),
  status VARCHAR(20), -- 'sent', 'delivered', 'failed'
  twilio_sid VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_session ON sms_logs(session_id);
CREATE INDEX idx_created ON sms_logs(created_at);
```

### Redis Cache

**Key format:** `sms:session:{phone_number}`

**Value:** JSON-serialized session object

**TTL:** 24 hours (auto-refresh on interaction)

**Invalidation:** On every state change, update Redis + PostgreSQL

### Background Jobs

**Job 1: Review Expiry** (every 15 min)
- Load all sessions with pending_reviews
- Check each review.expires_at
- Remove expired reviews
- Update sessions

**Job 2: Session Cleanup** (every hour)
- Load sessions where last_interaction < 7 days ago
- Delete if pending_reviews = []
- Keep if has pending reviews (might be paused)

**Job 3: SMS Retry** (every 5 min)
- Load failed SMS from sms_logs
- Retry up to 3 times
- Mark as permanently failed after 3 attempts
- Alert admin

---

## Testing Scenarios

### Test Case 1: Basic Flow

1. Send review → User gets notification
2. User sends "APPROVE" → Reply posted
3. Session pending = 0

### Test Case 2: Multi-Review Queue

1. Send 3 reviews rapidly
2. Verify only 1 notification sent
3. User approves → Next notification sent
4. User ignores → Final notification sent

### Test Case 3: Pause/Resume

1. User sends "PAUSE"
2. Send review → No notification
3. User sends "RESUME" → Gets queued notification

### Test Case 4: Expiry

1. Send review, wait 25 hours
2. User sends "APPROVE" → Error: expired

### Test Case 5: Edit Flow

1. User sends "EDIT make it shorter"
2. System regenerates draft
3. User gets new draft notification
4. User approves

---

## Metrics to Track

- **Average pending per session:** Indicates if users falling behind
- **Time to action:** Review received → User action (APPROVE/IGNORE)
- **Expiry rate:** % of reviews that expire without action
- **PAUSE usage:** % of users who pause (indicates overwhelm?)
- **EDIT rate:** % of drafts that need editing (AI quality indicator)

---

**Document Version:** 1.0  
**Last Updated:** 2026-02-13  
**Author:** Subagent (maitreo-sms-design)
