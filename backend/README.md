# Maitreo Backend - Review Polling System

## Phase 2: Review Monitoring (BUILT)

### What It Does
- Polls Google Business Profile API every 5 minutes
- Detects new reviews
- Classifies sentiment (positive/negative)
- Stores reviews in Supabase
- Sends SMS alerts for negative reviews

### Architecture

```
┌─────────────────────────────────────────────┐
│         Review Polling Service              │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  Poll Loop (every 5 minutes)         │  │
│  │                                      │  │
│  │  1. Fetch active restaurants        │  │
│  │  2. Get fresh OAuth access tokens   │  │
│  │  3. Call Google Business Profile API│  │
│  │  4. Compare with last known reviews │  │
│  │  5. Store new reviews in Supabase   │  │
│  │  6. Classify sentiment (1-3★ = neg) │  │
│  │  7. Send SMS for negative reviews   │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Files

- **`services/review-poller.js`** - Core polling logic
- **`server.js`** - Express server + background poller
- **`routes/google-oauth.js`** - OAuth endpoints (Phase 1)
- **`routes/sms-webhooks.js`** - Twilio SMS handler (Phase 3)
- **`routes/reviews.js`** - Manual review operations

### Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Start server:**
   ```bash
   npm start
   ```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (admin access) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `TOKEN_ENCRYPTION_KEY` | 64-char hex key for encrypting OAuth tokens |
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Maitreo phone number (+18553405068) |
| `OPENAI_API_KEY` | OpenAI API key for response generation |

### Testing

**Test single poll cycle:**
```bash
npm run poll
```

**Start continuous polling:**
```bash
npm start
```

### Database Schema

Reviews are stored in `reviews` table:
```sql
{
  id: uuid,
  restaurant_id: uuid,
  google_review_id: text,
  reviewer_name: text,
  rating: int (1-5),
  comment: text,
  sentiment: text ('positive' | 'negative'),
  create_time: timestamp,
  update_time: timestamp,
  status: text ('pending_review' | 'approved' | 'ignored'),
  ai_response: text (generated response),
  posted_at: timestamp (when response was posted to Google)
}
```

### Sentiment Classification

- **Positive:** 4-5 stars
  - Status: `auto_approved`
  - Action: No SMS alert (can be reviewed in weekly digest)

- **Negative:** 1-3 stars
  - Status: `pending_review`
  - Action: Immediate SMS alert to owner
  - SMS format:
    ```
    ⚠️ NEW REVIEW (2⭐)
    
    "Food was cold and service was slow."
    
    – John D.
    
    Reply APPROVE to post AI response
    Reply EDIT to customize response
    Reply IGNORE to skip
    ```

### API Endpoints

- `GET /health` - Server health check
- `GET /api/google/auth` - Start Google OAuth flow (Phase 1)
- `GET /api/google/callback` - OAuth callback (Phase 1)
- `POST /api/sms/incoming` - Twilio webhook (Phase 3)
- `GET /api/reviews/:restaurantId` - List reviews (TODO)

### Next Steps (Phase 3)

- [ ] SMS command parsing (APPROVE, EDIT, IGNORE, etc.)
- [ ] AI response generation (OpenAI GPT-4o-mini)
- [ ] Response posting to Google Business Profile
- [ ] Weekly digest generator

### Deployment

**Railway:**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy backend
railway up
```

**Environment:** Set all env vars in Railway dashboard

### Monitoring

Check logs for polling activity:
```
=== Starting Review Poll Cycle ===
Time: 2026-02-13T20:35:00.000Z
Polling 1 restaurant(s)...
[Luigi's Pizza] Starting review poll...
[Luigi's Pizza] Found 2 new review(s)
[Luigi's Pizza] SMS alert sent for review 123

=== Poll Cycle Complete ===
Success: 1, Failed: 0, New Reviews: 2
```

### Error Handling

- OAuth token refresh failures logged to `restaurants.last_error`
- Failed polls don't crash service (Promise.allSettled)
- Continues polling other restaurants if one fails
- SMS failures logged but don't stop polling

---

**Status:** ✅ Phase 2 Complete (untested)
**Next:** Phase 3 - SMS Command System
