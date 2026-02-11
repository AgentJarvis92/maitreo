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
