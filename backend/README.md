# ReviewReply - Restaurant Review Management SaaS

## Pipeline Architecture

```
Google Places API  ──→  Review Fetcher  ──→  Database (Supabase)
                              │
                              ▼
                      Review Classifier
                     (4-5★ = positive)
                     (1-3★ = negative)
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              POSITIVE              NEGATIVE
            Auto-post             SMS Approval
           (mock reply)         (Twilio → Owner)
                │                       │
                ▼                       ▼
          reply_drafts            reply_drafts
         status: 'sent'        status: 'pending'
                                        │
                                Owner replies:
                              YES → post reply
                              NO  → skip
                              [text] → custom reply
```

## Review Flow

1. **Fetch**: `reviewPoller.ts` polls Google Places API every 15 min for all restaurants
2. **Store**: New reviews synced to `reviews` table (deduped by platform + review_id)
3. **Classify**: Rating-based sentiment (4-5★ positive, 1-3★ negative) + keyword analysis
4. **Generate Reply**: Currently using placeholder templates (`mockReplyGenerator.ts`)
   - TODO: Swap with OpenAI GPT-4o via `replyGenerator.ts` when API is active
5. **Route**:
   - Positive → auto-post (mock) + mark as sent
   - Negative → SMS to owner via Twilio for approval
6. **SMS Webhook**: Owner replies YES/NO/custom text → updates draft status

## Key Files

| File | Purpose |
|------|---------|
| `src/services/reviewFetcher.ts` | Fetch & sync reviews from Google |
| `src/services/reviewClassifier.ts` | Classify sentiment, determine routing |
| `src/services/reviewProcessor.ts` | Main pipeline orchestrator |
| `src/services/mockReplyGenerator.ts` | Placeholder replies (until OpenAI) |
| `src/services/replyGenerator.ts` | OpenAI GPT-4o reply generation (TODO) |
| `src/services/onboarding.ts` | Add restaurants, validate place IDs |
| `src/jobs/reviewPoller.ts` | Cron job: poll all restaurants |
| `src/sms/webhookHandler.ts` | Twilio incoming SMS webhook |
| `src/sms/smsService.ts` | SMS formatting and approval flow |

## Database Schema

- **restaurants** — Business profiles, owner_phone, google_place_id
- **reviews** — Ingested reviews (unique by platform + review_id)
- **reply_drafts** — AI-generated replies (pending/approved/rejected/sent)
- **sms_messages** — SMS audit trail
- **newsletters** — Weekly intelligence digests

## Quick Start

```bash
# Install
npm install

# Run full pipeline test
npx tsx test-full-pipeline.ts

# Run review poller once
npx tsx src/jobs/reviewPoller.ts

# Run poller continuously (every 15 min)
npx tsx src/jobs/reviewPoller.ts --loop

# Start HTTP server (health check + webhooks)
npx tsx src/index.ts
```

## Environment Variables

See `.env` for required keys:
- `GOOGLE_PLACES_API_KEY` — Google Places API
- `SUPABASE_URL` / `SUPABASE_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — Database
- `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` — SMS
- `OPENAI_API_KEY` — AI reply generation (TODO: activate)

## Testing

```bash
# Full end-to-end test (onboard → fetch → classify → reply → route)
npx tsx test-full-pipeline.ts

# Quick API tests
npx tsx src/test-pipeline.ts
npx tsx src/test-twilio.ts
```

## ✅ Current Status (2026-02-11)

**Pipeline is LIVE and working:**
- ✅ Google Places API (New) - Fetching real reviews from Joe's Pizza
- ✅ Mock Reply Generator - Template-based replies (40+ variations)
- ✅ SMS Approval - Twilio integration tested and working
- ✅ Review Classification - 4-5★ = auto-post, 1-3★ = SMS approval
- ✅ Database - Supabase storing reviews + reply drafts
- ✅ **Cron Job - Auto-checks every 15 minutes via OpenClaw**

### 🧪 Quick Tests

```bash
# Test with real Google reviews (no API needed)
npx tsx run-live-test.ts

# Test negative review SMS flow
npx tsx test-negative-review.ts

# Run cron job manually
npx tsx cron-review-checker.ts
```

### ⏰ Automated Review Checking

**Active cron job:** Checks for new reviews **every 15 minutes**
- Fetches from Google Places API
- Processes through full pipeline
- Auto-posts positive reviews (currently mocked)
- Sends SMS approval for negative reviews
- Reports summary via iMessage

See `CRON_SETUP.md` for cron management commands.

### 🚧 Still Using Mocks

- **Mock replies** instead of OpenAI (waiting for $10 credit to activate)
- **Mock posting** instead of Google Business Profile API (can add later)
- **SMS approval flow works** - tested and functional ✅

### 📱 What You'll Receive

When a **negative review** (1-3★) comes in:
1. SMS notification with review text
2. AI-generated draft reply
3. Options: Reply YES to approve, NO to skip, or type custom text

When the **cron runs** (every 15 min):
- iMessage notification if new reviews found
- Summary: X restaurants checked, Y new reviews, Z SMS sent

### 🚀 Next Steps

1. **Activate OpenAI** - Replace mock generator with GPT-4o ($10 credit pending)
2. **Add webhook handler** - Process SMS replies (YES/NO/custom text)
3. **Real posting to Google** - Connect Business Profile API (optional)
4. **Find pilot customer** - Test with real restaurant

