# Maitreo Phase 1 - Deployment Instructions

## Overview

This document provides step-by-step instructions to deploy Maitreo Phase 1 (Core Payment → Google Connection Flow).

**Components:**
- Backend: Node.js Express server with Supabase
- Frontend: HTML forms (onboarding + success)
- Database: Supabase PostgreSQL with customers table
- Payment: Stripe (test mode)

---

## Quick Start (Local Testing)

### 1. Create Database Table

Open **Supabase Dashboard → SQL Editor** and paste this:

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
CREATE INDEX idx_customers_onboarding_status ON customers(onboarding_status);

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_reviews_customer_id ON reviews(customer_id);
```

Click "Run".

### 2. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select or create a project
3. Enable APIs:
   - Google Business Profile API
   - Google My Business Account Management API
4. Create OAuth 2.0 Credential:
   - Application type: Web Application
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: 
     - `http://localhost:3000/api/google/callback`
5. Copy Client ID and Secret

### 3. Update .env

Edit `backend/.env`:

```bash
# Google OAuth
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback

# Stripe test keys (from dashboard.stripe.com)
STRIPE_PUBLIC_KEY=pk_test_51NZw1rAqJ5eVzYk5L1z9aB2cD3eF4gH...
STRIPE_SECRET_KEY=sk_test_51NZw1rAqJ5eVzYk5L1z9aB2cD3eF4gH...
STRIPE_WEBHOOK_SECRET=whsec_test_1234567890abcdefghijklmnopqrstuv
```

### 4. Start Backend

```bash
cd backend
npm start
```

Output should show:
```
✅ Maitreo Backend Server
📡 API: http://localhost:3000
🏥 Health: http://localhost:3000/health
```

### 5. Test Full Flow

**Option A: End-to-End Test**
```bash
cd backend
node test-phase1-flow.js
```

**Option B: Manual Test**

1. Simulate payment (create customer):
```bash
curl -X POST http://localhost:3000/api/stripe/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "id": "pi_test_123",
        "client_email": "owner@test.com",
        "amount": 9900,
        "metadata": {
          "sessionId": "test_session_' + date +%s + '"
        }
      }
    }
  }'
```

2. Get session ID from database and open form:
```
http://localhost:3000/public/onboarding.html?sessionId=test_session_XXX
```

3. Fill out and submit form
4. Click "Authorize Google Business"
5. Complete Google authorization
6. Success page confirms setup

---

## Production Deployment

### Server Deployment (Render, Railway, Vercel)

#### Option 1: Render.com

```bash
# 1. Create Render account and connect GitHub

# 2. New Web Service:
# - Name: maitreo-backend
# - Environment: Node
# - Build Command: npm install
# - Start Command: npm start
# - Plan: Free or Paid

# 3. Add Environment Variables:
# - SUPABASE_URL
# - SUPABASE_SERVICE_KEY
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET
# - GOOGLE_REDIRECT_URI (update to your domain)
# - STRIPE_PUBLIC_KEY
# - STRIPE_SECRET_KEY
# - STRIPE_WEBHOOK_SECRET
# - TOKEN_ENCRYPTION_KEY

# 4. Deploy button should auto-deploy on push
```

#### Option 2: Railway.app

```bash
# 1. Install Railway CLI: npm i -g @railway/cli
# 2. Login: railway login
# 3. Link project: railway link
# 4. Deploy: railway up
# 5. Set environment variables in Railway dashboard
```

### Frontend Deployment (Vercel, Netlify)

```bash
# Deploy HTML files to any static host:

# Option A: Vercel (easiest)
vercel deploy --name maitreo-frontend

# Option B: Netlify
netlify deploy --dir=frontend/public --prod

# Option C: AWS S3 + CloudFront
aws s3 cp frontend/public/* s3://maitreo-frontend/ --recursive
```

### Update OAuth Redirect URI

When deploying to production, update everywhere:

1. **Google Cloud Console**:
   - Settings → OAuth consent screen
   - Add authorized redirect URI: `https://yourdomain.com/api/google/callback`

2. **Backend .env**:
   ```bash
   GOOGLE_REDIRECT_URI=https://yourdomain.com/api/google/callback
   ```

3. **Stripe Dashboard** (if using custom domain):
   - Webhooks → Endpoint URL: `https://yourdomain.com/api/stripe/webhook`

### Domain Setup

Update in `PHASE1_SETUP.md`:
```bash
# Change all references from localhost to your domain
http://localhost:3000 → https://yourdomain.com
```

---

## Testing Checklist

- [ ] Database created in Supabase
- [ ] Google OAuth credentials configured
- [ ] Environment variables all set
- [ ] Backend server starts without errors
- [ ] Health check: `curl http://localhost:3000/health`
- [ ] Onboarding form accessible
- [ ] Form submission creates customer record
- [ ] Google OAuth redirect works
- [ ] Reviews fetch endpoint returns data
- [ ] Stripe webhook test successful

---

## Stripe Test Webhook

Install Stripe CLI:

```bash
# macOS
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Start listener
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Trigger test event (in another terminal)
stripe trigger payment_intent.succeeded
```

---

## Database Backup

### Supabase Auto-Backup
- Automatic daily backups (included with Supabase)
- Accessible via Settings → Database → Backups

### Manual Export
```bash
# Backup customers table
psql $DATABASE_URL -c "COPY customers TO STDOUT WITH CSV HEADER" > customers.csv

# Restore
psql $DATABASE_URL -c "COPY customers FROM STDIN WITH CSV HEADER" < customers.csv
```

---

## Monitoring

### Server Health

```bash
# Check server status
curl http://localhost:3000/health

# Check server logs
# Render: Dashboard → Logs
# Railway: Dashboard → Logs
# Local: npm start output
```

### Database Health

In Supabase Dashboard → Database → Query Performance:
- Monitor slow queries
- Check connection limits
- Review table sizes

### Error Tracking

Logs show:
- Failed OAuth attempts
- Payment webhook errors
- Database connection issues
- Invalid requests

---

## Rollback Procedure

If issues occur:

1. **Code Rollback**:
   ```bash
   # Render: Click "Deploy" → Select previous deployment
   # Railway: railway rollback
   # Manual: git revert COMMIT_HASH && git push
   ```

2. **Database Rollback**:
   - Supabase: Settings → Database → Backups → Restore
   - Restore from previous timestamp

3. **Environment Rollback**:
   - Revert environment variables to previous values
   - Restart server

---

## Security Notes

### SSL/TLS
- Enable HTTPS everywhere
- Supabase: Automatic (included)
- Custom domain: Use CloudFlare or similar for SSL

### Secrets Management
- Never commit `.env` file
- Use environment variables for all secrets
- Rotate keys quarterly

### Database Security
- Enable row-level security (RLS) in Supabase
- Restrict service role access
- Use read-only role for reviews API

### API Security
- Rate limiting (Stripe handles for webhooks)
- CORS: Only allow from your domain
- Input validation: All form inputs sanitized

---

## Support & Troubleshooting

### Common Issues

**"Table not found" error**
- Solution: Run SQL migration in Supabase SQL Editor

**"Google OAuth failed"**
- Check: Client ID/Secret correct
- Check: Redirect URI matches
- Check: OAuth consent screen approved

**"Stripe webhook not received"**
- Check: Webhook secret correct
- Check: Endpoint URL accessible
- Use: Stripe CLI for local testing

### Debug Mode

Add to `server.js`:
```javascript
if (process.env.DEBUG) {
  console.log('Request:', req.method, req.path, req.body);
  console.log('Response:', res.statusCode);
}
```

Set environment: `DEBUG=true`

### Contact Support

- Supabase: https://supabase.com/support
- Stripe: https://support.stripe.com
- Google Cloud: https://cloud.google.com/support
- OpenClaw: Check documentation

---

## Version Info

- **Phase 1 Release:** February 13, 2026
- **Backend Version:** 1.0.0
- **Node Version:** >=18.0.0
- **Database:** PostgreSQL 16 (Supabase)

---

**Next Phase:** Phase 2 includes SMS commands, auto-polling, and AI reply generation.
