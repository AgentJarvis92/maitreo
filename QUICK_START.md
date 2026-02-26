# 🚀 Maitreo Phase 1 - Quick Start

Get started in 5 minutes!

## Prerequisites

- Node.js >= 18.0.0 (`node --version`)
- Supabase account (with existing project)
- Google Cloud account
- Stripe account (test mode)

---

## Step 1: Create Database Table (2 min)

1. Go to **[Supabase Dashboard](https://supabase.com/dashboard)**
2. Select your project
3. Click **SQL Editor** (left sidebar)
4. Click **New Query**
5. Paste this SQL:

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

6. Click **Run**
7. Done! ✅

---

## Step 2: Get Google Credentials (2 min)

1. Go to **[Google Cloud Console](https://console.cloud.google.com)**
2. Click project dropdown → **Create New Project**
3. Name it "Maitreo" → **Create**
4. Search for **"Google Business Profile API"** → **Enable**
5. Search for **"My Business Account Management API"** → **Enable**
6. Go to **Credentials** (left sidebar)
7. Click **+ Create Credentials** → **OAuth Client ID**
8. Choose **Web Application**
9. Under "Authorized redirect URIs", add:
   ```
   http://localhost:3000/api/google/callback
   ```
10. Click **Create**
11. Copy **Client ID** and **Client Secret**

---

## Step 3: Get Stripe Keys (1 min)

1. Go to **[Stripe Dashboard](https://dashboard.stripe.com)**
2. Click **Developers** → **API Keys** (top right)
3. Copy **Publishable key** (pk_test_...)
4. Copy **Secret key** (sk_test_...)
5. Go to **Webhooks**
6. Click **+ Add endpoint**
7. URL: `http://localhost:3000/api/stripe/webhook`
8. Select: `payment_intent.succeeded` and `payment_intent.payment_failed`
9. Click **Add endpoint**
10. Copy **Signing secret**

---

## Step 4: Update Environment (1 min)

Edit `backend/.env`:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback

# Stripe (paste your keys)
STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Already set:
# SUPABASE_URL=...
# SUPABASE_SERVICE_KEY=...
# TOKEN_ENCRYPTION_KEY=...
```

Save the file.

---

## Step 5: Start Server (1 min)

```bash
cd backend
npm start
```

You should see:
```
✅ Maitreo Backend Server
📡 API: http://localhost:3000
🏥 Health: http://localhost:3000/health
```

---

## Step 6: Test (Optional)

### Test Complete Flow
```bash
# In another terminal
cd backend
node test-phase1-flow.js
```

Expected output:
```
✅ Phase 1 End-to-End Test PASSED
```

### Test with Browser

1. Open: `http://localhost:3000/public/onboarding.html?sessionId=test_123`
2. Fill out form:
   - Name: "Test Restaurant"
   - Location: "123 Main St"
   - Phone: "(555) 123-4567"
   - Email: "owner@test.com"
3. Click **Continue to Google Business**
4. Click **Authorize Google Business**
5. Login with your Google account
6. Grant permissions
7. See success page ✅

---

## Complete Flow

```
1. Payment ($99) → Webhook creates customer
2. Form page opens → User fills restaurant info
3. Google auth → User authorizes Google access
4. Success! → Customer is set up and ready
```

---

## API Endpoints

```bash
# Health check
curl http://localhost:3000/health

# Get onboarding form
curl http://localhost:3000/api/onboarding/form/test_123

# Submit onboarding form
curl -X POST http://localhost:3000/api/onboarding/form \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test_123",
    "restaurantName": "Test",
    "location": "123 Main",
    "phone": "+1-555-0100",
    "email": "test@test.com"
  }'

# Check Google status
curl http://localhost:3000/api/google/status/test_123

# Fetch reviews
curl http://localhost:3000/api/reviews/fetch/test_123

# List reviews
curl http://localhost:3000/api/reviews/list/test_123
```

---

## Done! ✅

You're ready to go. The complete onboarding flow is now live locally.

**Next**: See `PHASE1_SETUP.md` for production deployment.

---

## Troubleshooting

### "Could not find table 'customers'"
- Run the SQL migration from Step 1 again
- Make sure you clicked **Run**

### "Google OAuth failed"
- Check Client ID/Secret in `.env`
- Make sure redirect URI matches: `http://localhost:3000/api/google/callback`
- Verify both Google APIs are enabled

### Server won't start
- Check: `npm install` (install dependencies)
- Check: Node version is >= 18.0.0
- Check: `.env` file exists and has SUPABASE_URL

### Stripe webhook not working
- For local testing, install Stripe CLI and use `stripe listen`
- In production, add your domain's webhook endpoint to Stripe dashboard

---

Need help? Check `PHASE1_SETUP.md` or `backend/PHASE1_ENDPOINTS.md`
