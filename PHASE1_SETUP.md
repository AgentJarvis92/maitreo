# Maitreo Phase 1: Core Payment → Google Connection Flow

**Status:** Phase 1 implementation complete ✅
**Date:** February 13, 2026

## What's Built

### 1. **Backend Routes** ✅
- `POST /api/stripe/webhook` - Stripe payment success handler
- `GET /api/onboarding/form/:sessionId` - Get onboarding form (pre-fill)
- `POST /api/onboarding/form` - Submit onboarding form
- `GET /api/google/auth?sessionId=...` - Initiate Google OAuth
- `GET /api/google/callback` - OAuth callback handler
- `GET /api/google/status/:sessionId` - Check Google connection status
- `GET /api/reviews/fetch/:sessionId` - Manually fetch reviews
- `GET /api/reviews/list/:sessionId` - List fetched reviews with stats

### 2. **Frontend Forms** ✅
- **Onboarding Form** (`/public/onboarding.html`)
  - Restaurant name, location, phone, email
  - Mobile-friendly, matches maitreo.com style
  - Multi-step progress indicator
  
- **Success Page** (`/public/onboarding-success.html`)
  - Confirmation screen after setup
  - Next steps guide
  - Link to dashboard

### 3. **Database Schema** ✅
New `customers` table for post-payment data:
```sql
- id (UUID, primary key)
- stripe_customer_id (Stripe payment customer)
- session_id (Payment session identifier)
- restaurant_name, location_address, phone_number, email
- google_email, google_location_id, google_location_name
- google_refresh_token_encrypted (AES-256-GCM encrypted)
- payment_status, payment_amount, payment_date
- onboarding_status, google_status
- created_at, updated_at
```

### 4. **Security Features** ✅
- **Token Encryption**: Google refresh tokens encrypted with AES-256-GCM before storage
- **OAuth State Validation**: Session ID passed as state parameter
- **Webhook Signature Verification**: Stripe webhooks verified with secret

## Setup Instructions

### Step 1: Create Database Table

Go to **Supabase Dashboard → SQL Editor** and run:

```sql
CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stripe_customer_id VARCHAR(255) UNIQUE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    restaurant_name VARCHAR(255),
    location_address VARCHAR(255),
    phone_number VARCHAR(20),
    email VARCHAR(255) NOT NULL,
    google_email VARCHAR(255),
    google_location_id VARCHAR(255),
    google_location_name VARCHAR(255),
    google_refresh_token_encrypted VARCHAR(1000),
    google_connected BOOLEAN DEFAULT FALSE,
    google_connected_at TIMESTAMP WITH TIME ZONE,
    payment_status VARCHAR(50) DEFAULT 'pending',
    payment_amount INTEGER,
    payment_date TIMESTAMP WITH TIME ZONE,
    onboarding_status VARCHAR(50) DEFAULT 'not_started',
    onboarding_completed_at TIMESTAMP WITH TIME ZONE,
    google_status VARCHAR(50) DEFAULT 'not_connected',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_customers_stripe_customer_id ON customers(stripe_customer_id);
CREATE INDEX idx_customers_session_id ON customers(session_id);
CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_payment_status ON customers(payment_status);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews(customer_id);
```

### Step 2: Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Enable these APIs:
   - Google Business Profile API
   - Google My Business API
4. Create OAuth 2.0 credentials:
   - Type: Web application
   - Authorized redirect URIs:
     - `http://localhost:3000/api/google/callback` (development)
     - `https://yourdomain.com/api/google/callback` (production)
5. Copy Client ID and Client Secret

### Step 3: Update Environment Variables

Edit `backend/.env`:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback  # Update for production

# Stripe (get test keys from dashboard)
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_test_...
```

### Step 4: Start Backend Server

```bash
cd ~/restaurant-saas/backend
npm install  # If not already done
npm start
```

Server will start on `http://localhost:3000`

### Step 5: Test the Complete Flow

Run the end-to-end test:

```bash
node test-phase1-flow.js
```

Expected output:
```
✅ Phase 1 End-to-End Test PASSED

Test Summary:
  ✓ Payment webhook → customer creation
  ✓ Onboarding form → customer update
  ✓ Google OAuth → token encryption & storage
  ✓ Review integration → database storage
  ✓ Data retrieval → full record access
```

## Testing Locally

### Option A: Direct Browser Test

1. Create a test customer manually:
```bash
node test-phase1-flow.js
```

2. Open onboarding form:
```
http://localhost:3000/onboarding.html?sessionId=test_session_XXX
```

3. Fill out form and submit

4. Click "Authorize Google Business" (this will redirect to Google login)

5. After authorization, you'll be redirected to success page

### Option B: Mock Payment Flow

```bash
# 1. Create payment session
curl -X POST http://localhost:3000/api/onboarding/form \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test_123",
    "restaurantName": "Test Restaurant",
    "location": "123 Main St",
    "phone": "+1-555-0100",
    "email": "owner@test.com"
  }'

# 2. Check customer status
curl http://localhost:3000/api/google/status/test_123

# 3. Get onboarding form
curl http://localhost:3000/api/onboarding/form/test_123

# 4. Fetch reviews
curl http://localhost:3000/api/reviews/fetch/test_123

# 5. List reviews
curl http://localhost:3000/api/reviews/list/test_123
```

## Stripe Webhook Integration

### Local Testing with Stripe CLI

1. Install Stripe CLI:
```bash
brew install stripe/stripe-cli/stripe
```

2. Login to Stripe:
```bash
stripe login
```

3. Forward webhooks to local server:
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

4. Trigger test event:
```bash
stripe trigger payment_intent.succeeded
```

### Production Webhook Setup

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Settings → Webhooks
3. Add endpoint:
   - URL: `https://yourdomain.com/api/stripe/webhook`
   - Events: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Get webhook secret and add to `.env` as `STRIPE_WEBHOOK_SECRET`

## Flow Diagram

```
Payment Success
      ↓
   Webhook Handler
      ↓
   Create Customer
      ↓
Redirect to Onboarding Form
(with session ID in URL)
      ↓
   User fills form
      ↓
   Submit Form
      ↓
   Redirect to Google OAuth
      ↓
   User authorizes Google
      ↓
   Store encrypted token
      ↓
   Redirect to success page
      ↓
Reviews visible in dashboard
```

## Next Steps (Phase 2)

- [ ] SMS command handling (APPROVE, EDIT, IGNORE)
- [ ] Auto-polling every 5 minutes
- [ ] AI-generated reply drafts
- [ ] Weekly competitor intelligence digest
- [ ] Dashboard for approval workflow

## Architecture

```
Frontend
├── onboarding.html (form + progress)
└── onboarding-success.html (confirmation)

Backend
├── routes/
│   ├── stripe-webhook.js (payment handling)
│   ├── onboarding.js (form submission)
│   ├── google-oauth.js (OAuth flow + token storage)
│   └── reviews.js (fetching + listing)
├── services/
│   └── review-poller.js (background polling - Phase 2)
└── database/
    └── customers table (post-payment data)
```

## Security Checklist

- ✅ Google refresh tokens encrypted with AES-256-GCM
- ✅ Encryption key from environment variable (never hardcoded)
- ✅ Stripe webhook signature verification
- ✅ OAuth state validation (prevents CSRF)
- ✅ CORS configured
- ✅ No sensitive data in logs
- ✅ Error messages don't leak details

## Troubleshooting

### "Could not find table 'public.customers'"
**Solution**: Run the SQL migration in Supabase SQL Editor (see Step 1)

### Google OAuth error: "Failed to get refresh token"
**Solution**: 
- Make sure "Offline" scope is requested
- Check that OAuth app has correct redirect URI
- Verify `GOOGLE_REDIRECT_URI` in `.env` matches app settings

### Stripe webhook not working
**Solution**:
- Use `stripe listen` to test locally
- Check webhook secret is correct in `.env`
- Verify endpoint is accessible (use `ngrok` for local testing)

### Reviews not fetching
**Solution**:
- Verify Google OAuth token is encrypted and stored
- Check Google Business Profile API is enabled in Cloud Console
- Ensure location name format is: `accounts/{accountId}/locations/{locationId}`

## Support

For issues:
1. Check server logs: `npm start` shows all request/error logs
2. Check Supabase dashboard for data
3. Check Stripe dashboard for webhook logs
4. Use browser DevTools to inspect network requests

---

**Build Date:** Feb 13, 2026  
**Version:** 1.0.0  
**Status:** Production Ready ✅
