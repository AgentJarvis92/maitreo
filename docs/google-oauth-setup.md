# Google Business Profile OAuth Setup — Maitreo

## Prerequisites
1. Google Cloud project with billing enabled
2. Node.js backend running (`~/restaurant-saas/backend/`)
3. Supabase database with migration applied (003_google_oauth_tokens.sql)

## Step 1: Enable Google Business Profile API

1. Go to [Google Cloud Console → APIs & Services](https://console.cloud.google.com/apis/library)
2. Search for **"Google Business Profile API"** (NOT Google Places API)
3. Click **Enable**
4. Also enable **"My Business Account Management API"** (for fetching account/location info)
5. Also enable **"My Business Business Information API"** (for location data)

> ⚠️ The Google Places API is for public read-only data. The Business Profile API is for authenticated management (replying to reviews, etc.)

## Step 2: Configure OAuth 2.0 Consent Screen

1. Go to [APIs & Services → OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent)
2. Select **External** user type
3. Fill in:
   - **App name:** Maitreo
   - **User support email:** velasco18@yahoo.com
   - **Developer contact:** velasco18@yahoo.com
4. Add scope: `https://www.googleapis.com/auth/business.manage`
5. Add test users (while in testing mode): your Google account email
6. Save

## Step 3: Create OAuth 2.0 Credentials

1. Go to [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Name: `Maitreo Backend`
5. Authorized redirect URIs:
   - `http://localhost:3000/auth/google/callback` (development)
   - `https://maitreo.com/auth/google/callback` (production)
6. Copy the **Client ID** and **Client Secret**

## Step 4: Configure Environment Variables

Add to `~/restaurant-saas/backend/.env`:

```env
GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
TOKEN_ENCRYPTION_KEY=<64-char-hex-string>
```

Generate encryption key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## Step 5: Test OAuth Flow

1. Start the backend: `cd ~/restaurant-saas/backend && npm run dev`
2. Open browser: `http://localhost:3000/auth/google/start?restaurant_id=YOUR_RESTAURANT_UUID`
3. You should see Google's consent screen
4. Approve access
5. You'll be redirected back with "✅ Google Connected!" message
6. Verify tokens stored: check `restaurants` table for `google_access_token` (should be non-null, encrypted)

## Step 6: Test Review Fetching

```bash
# Get locations
curl http://localhost:3000/api/locations?restaurant_id=YOUR_UUID

# Fetch reviews (use locationName from above)
curl -X POST http://localhost:3000/api/reviews/fetch \
  -H "Content-Type: application/json" \
  -d '{"restaurantId":"YOUR_UUID","locationName":"locations/LOCATION_ID"}'
```

## Step 7: Test Reply Posting

Reply posting happens automatically via the response poster loop. To test manually:
1. Approve a reply draft (set `status = 'approved'` in `reply_drafts` table)
2. Trigger: `curl -X POST http://localhost:3000/jobs/responses/post`
3. Check the review on Google Maps for the reply

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/auth/google/start?restaurant_id=UUID` | GET | Starts OAuth flow (redirects to Google) |
| `/auth/google/callback` | GET | OAuth callback (handled automatically) |
| `/api/locations?restaurant_id=UUID` | GET | List connected Google Business locations |
| `/api/reviews/fetch` | POST | Fetch reviews from GBP API |

## Architecture

```
Restaurant Owner clicks "Connect Google"
  → GET /auth/google/start?restaurant_id=XXX
  → Redirect to Google OAuth consent screen
  → User approves
  → Google redirects to /auth/google/callback?code=XXX&state=XXX
  → Backend exchanges code for tokens
  → Tokens encrypted (AES-256-GCM) and stored in restaurants table
  → Auto-refresh before expiry (<5 min remaining)
```

## Files

- `src/services/googleOAuth.ts` — OAuth flow, token exchange, refresh
- `src/services/googleBusinessProfile.ts` — Review fetching, reply posting via GBP API
- `src/services/tokenEncryption.ts` — AES-256-GCM token encryption
- `src/services/responsePoster.ts` — Updated to use authenticated GBP reply posting
- `src/db/migrations/003_google_oauth_tokens.sql` — Database migration

## Troubleshooting

- **"No Google Business accounts found"** — The Google account used for OAuth must be an owner/manager of a Google Business Profile
- **Token refresh fails with "invalid_grant"** — The user revoked access; they need to re-authorize
- **403 on reply** — The account doesn't have management access to that location
- **Consent screen shows "unverified app"** — Expected in testing mode; click "Advanced" → "Go to Maitreo (unsafe)" to proceed

## Moving to Production

1. Submit OAuth consent screen for Google verification
2. Update `GOOGLE_REDIRECT_URI` to `https://maitreo.com/auth/google/callback`
3. Remove test user restrictions
4. Add privacy policy at `https://maitreo.com/privacy`
5. Add terms of service at `https://maitreo.com/terms`
