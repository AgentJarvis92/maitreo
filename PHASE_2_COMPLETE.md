# Phase 2: Review Polling System ✅

**Built:** February 13, 2026  
**Status:** Complete (untested)

## What Was Built

### Core Polling Service (`backend/services/review-poller.js`)
- Background service that runs every 5 minutes
- Fetches all active restaurants from Supabase
- Decrypts Google OAuth refresh tokens
- Calls Google Business Profile API to fetch reviews
- Compares with last known reviews to detect new ones
- Classifies sentiment (4-5★ = positive, 1-3★ = negative)
- Stores reviews in Supabase
- Sends SMS alerts for negative reviews via Twilio

### Server Architecture (`backend/server.js`)
- Express API server + background polling service
- Health check endpoint (`/health`)
- Graceful shutdown handling
- Auto-starts polling on server startup

### API Routes (Placeholders)
- `/api/google/*` - OAuth endpoints (Phase 1 code to be moved)
- `/api/sms/incoming` - Twilio webhook (Phase 3)
- `/api/reviews/*` - Review management (Phase 3)

## Technical Details

### Polling Logic
1. Every 5 minutes, fetch active restaurants with `google_refresh_token`
2. For each restaurant:
   - Refresh Google OAuth access token
   - Fetch reviews from Google Business Profile API
   - Get last known review timestamp from database
   - Filter new reviews (newer than last known)
   - Store each new review in `reviews` table
   - Send SMS alert if rating ≤ 3 stars

### Sentiment Classification
- **Positive (4-5★):** `status = 'auto_approved'`, no immediate alert
- **Negative (1-3★):** `status = 'pending_review'`, SMS alert sent

### SMS Alert Format
```
⚠️ NEW REVIEW (2⭐)

"Food was cold and service was slow."

– John D.

Reply APPROVE to post AI response
Reply EDIT to customize response
Reply IGNORE to skip
```

### Database Updates
- New reviews stored in `reviews` table
- `restaurants.last_polled_at` updated after each poll
- `restaurants.last_error` logged if poll fails

### Error Handling
- Uses `Promise.allSettled` - one restaurant failure doesn't stop others
- OAuth token refresh errors logged to database
- SMS send failures logged but don't crash polling
- Service continues running even if all polls fail

## Files Created

```
backend/
├── server.js                    # Main server + polling service
├── package.json                 # Dependencies
├── .env.example                 # Environment template
├── README.md                    # Documentation
├── services/
│   └── review-poller.js        # Core polling logic (266 lines)
└── routes/
    ├── google-oauth.js         # OAuth placeholders
    ├── sms-webhooks.js         # SMS webhook placeholder
    └── reviews.js              # Review API placeholder
```

## Dependencies

```json
{
  "@supabase/supabase-js": "^2.39.0",
  "express": "^4.18.2",
  "googleapis": "^126.0.0",
  "twilio": "^4.19.0",
  "openai": "^4.20.0",
  "dotenv": "^16.3.1",
  "cors": "^2.8.5"
}
```

## Next Steps

### Before Testing
1. Set up `.env` file with all credentials
2. Install dependencies: `npm install`
3. Verify Supabase tables exist (restaurants, reviews)
4. Test with at least one restaurant in database with Google OAuth connected

### Phase 3 Requirements
- [ ] SMS command parsing (APPROVE, EDIT, IGNORE, STATUS, etc.)
- [ ] AI response generation (OpenAI GPT-4o-mini)
- [ ] Response posting to Google Business Profile
- [ ] Draft storage and editing workflow

### Phase 4 (Weekly Digest)
- [ ] Digest template design
- [ ] Email sending via Resend
- [ ] Cron job for Sunday morning send

## Testing Commands

```bash
# Install dependencies
cd backend && npm install

# Test single poll cycle
npm run poll

# Start continuous polling (every 5 min)
npm start

# Check health
curl http://localhost:3000/health
```

## Deployment Notes

**Railway:**
- Service will auto-restart on crash
- Set `NODE_ENV=production` in Railway
- Add all environment variables in Railway dashboard
- Service will poll every 5 minutes automatically

**Monitoring:**
- Check Railway logs for poll cycle summaries
- Look for "=== Poll Cycle Complete ===" messages
- Monitor for OAuth refresh errors
- Watch for SMS send failures

---

**Ready for:** Phase 3 (SMS Command System)
