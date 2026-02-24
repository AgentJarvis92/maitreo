# Maitreo Testing Guide

## Step 1: Set Up Supabase Database

1. **Go to Supabase dashboard:** https://supabase.com/dashboard
2. **Select your project** (or create a new one)
3. **Go to SQL Editor** (left sidebar)
4. **Run schema.sql:**
   - Copy contents of `database/schema.sql`
   - Paste into SQL Editor
   - Click "Run"
   - Verify tables created: restaurants, reviews, sms_interactions, weekly_digests

5. **Run test data:**
   - Copy contents of `database/test-data.sql`
   - Run in SQL Editor
   - Verify test restaurant inserted

6. **Get credentials:**
   - Go to Settings → API
   - Copy **Project URL** (SUPABASE_URL)
   - Copy **service_role key** (SUPABASE_SERVICE_KEY) - This is the admin key

## Step 2: Get Google OAuth Credentials

1. **Go to Google Cloud Console:** https://console.cloud.google.com
2. **Enable APIs:**
   - Google Business Profile API
   - Google My Business API (if needed)
3. **Create OAuth 2.0 Client:**
   - APIs & Services → Credentials
   - Create OAuth 2.0 Client ID
   - Application type: Web application
   - Authorized redirect URIs: `https://maitreo.com/api/google/callback`
   - Copy **Client ID** and **Client Secret**

## Step 3: Get Twilio Credentials

1. **Go to Twilio Console:** https://console.twilio.com
2. **Get credentials:**
   - Account SID
   - Auth Token
   - Phone Number: +18553405068 (already purchased)

## Step 4: Generate Encryption Key

Run this command to generate a 32-byte (64-char hex) encryption key:

```bash
openssl rand -hex 32
```

Copy the output for TOKEN_ENCRYPTION_KEY.

## Step 5: Create .env File

```bash
cd ~/restaurant-saas/backend
cp .env.example .env
```

Edit `.env` with your credentials:

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://maitreo.com/api/google/callback

# Token Encryption
TOKEN_ENCRYPTION_KEY=your-64-char-hex-key-from-openssl

# Twilio SMS
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=+18553405068

# OpenAI (for response generation)
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx

# Server
PORT=3000
NODE_ENV=development
```

## Step 6: Install Dependencies

```bash
cd ~/restaurant-saas/backend
npm install
```

Expected packages:
- @supabase/supabase-js
- express
- googleapis
- twilio
- openai
- dotenv
- cors

## Step 7: Test Phase 1 (Google OAuth)

### Manual OAuth Flow Test

1. **Start server:**
   ```bash
   npm start
   ```

2. **Test health check:**
   ```bash
   curl http://localhost:3000/health
   ```

3. **Test OAuth URL generation:**
   - Navigate to: http://localhost:3000/api/google/auth?restaurantId={uuid}
   - Should redirect to Google consent screen
   - Grant access
   - Should redirect back to callback
   - Check database: `google_refresh_token` should be populated (encrypted)

4. **Verify token encryption:**
   ```bash
   # In Supabase SQL Editor:
   SELECT id, business_name, google_refresh_token FROM restaurants;
   # Token should be in format: {iv}:{authTag}:{encrypted}
   ```

### Test Review Fetching

```bash
# Create test script: test-google-api.js
node backend/tests/test-google-api.js
```

## Step 8: Test Phase 2 (Review Polling)

### Test Single Poll Cycle

```bash
npm run poll
```

Expected output:
```
=== Starting Review Poll Cycle ===
Time: 2026-02-13T21:00:00.000Z
Polling 1 restaurant(s)...
[Test Pizza Place] Starting review poll...
[Test Pizza Place] Found X new review(s)

=== Poll Cycle Complete ===
Success: 1, Failed: 0, New Reviews: X
```

### Test Continuous Polling

```bash
npm start
```

Server should:
- Start on port 3000
- Begin polling every 5 minutes
- Log poll cycle summaries

### Test SMS Alerts

Add a test negative review to Google Business Profile:
- Rating: 1-3 stars
- Wait for next poll cycle (max 5 minutes)
- Check phone +18622901319 for SMS alert
- Verify SMS format matches spec

### Verify Database Updates

```sql
-- Check reviews table
SELECT * FROM reviews ORDER BY created_at DESC LIMIT 10;

-- Check last poll time
SELECT business_name, last_polled_at, last_error 
FROM restaurants 
WHERE status = 'active';
```

## Step 9: Test Error Handling

### Test OAuth Token Refresh

1. Manually corrupt refresh token in database
2. Wait for poll cycle
3. Verify error logged to `restaurants.last_error`
4. Verify other restaurants continue polling

### Test API Rate Limits

1. Lower poll interval to 10 seconds (temporarily)
2. Monitor for rate limit errors
3. Verify graceful handling

### Test SMS Send Failures

1. Temporarily set invalid Twilio credentials
2. Trigger negative review
3. Verify error logged but polling continues

## Common Issues

### "Cannot find module '@supabase/supabase-js'"
```bash
npm install
```

### "TOKEN_ENCRYPTION_KEY must be 32 bytes"
```bash
openssl rand -hex 32
```

### "Google OAuth redirect_uri_mismatch"
- Verify GOOGLE_REDIRECT_URI in .env matches Google Cloud Console
- Check for http vs https
- Ensure no trailing slash

### "Twilio 401 Unauthorized"
- Verify TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN
- Check Twilio console for account status

### "Supabase connection failed"
- Verify SUPABASE_URL and SUPABASE_SERVICE_KEY
- Check project is active (not paused)

## QA Checklist

- [ ] Database schema created successfully
- [ ] Test restaurant inserted
- [ ] .env file configured with all credentials
- [ ] Dependencies installed (npm install)
- [ ] Server starts without errors
- [ ] Health check responds
- [ ] Google OAuth flow works end-to-end
- [ ] Refresh token stored encrypted
- [ ] Can fetch reviews from Google API
- [ ] Poll cycle runs successfully
- [ ] New reviews detected and stored
- [ ] Sentiment classification correct
- [ ] SMS alerts sent for negative reviews
- [ ] last_polled_at timestamp updates
- [ ] Error handling works (OAuth, SMS, API)
- [ ] Continuous polling runs without crashes

---

**Next:** Once Phase 1 & 2 are tested and working, proceed to Phase 3 (SMS Command System).
