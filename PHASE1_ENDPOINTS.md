# Phase 1 API Endpoints Reference

## Base URL
```
Development: http://localhost:3000
Production: https://yourdomain.com
```

---

## Stripe Webhook

### POST /api/stripe/webhook
Handles Stripe payment success/failure events.

**Headers:**
```
Content-Type: application/json
Stripe-Signature: signature from Stripe
```

**Payload:**
```json
{
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_1234567890",
      "client_email": "owner@restaurant.com",
      "customer": "cus_1234567890",
      "amount": 9900,
      "metadata": {
        "sessionId": "sess_1234567890"
      }
    }
  }
}
```

**Response (Success):**
```json
{
  "received": true
}
```

**Response (Error):**
```json
{
  "error": "Webhook signature verification failed"
}
```

**What it does:**
- Verifies webhook signature
- Creates customer record in database
- Sets payment status to "completed"
- Ready for onboarding form

---

## Onboarding Form

### GET /api/onboarding/form/:sessionId
Retrieve existing onboarding data (for pre-filling).

**Parameters:**
- `sessionId` (string): Payment session ID from Stripe

**Example:**
```bash
curl http://localhost:3000/api/onboarding/form/sess_1234567890
```

**Response:**
```json
{
  "sessionId": "sess_1234567890",
  "customer": {
    "restaurantName": "The Blue Moon",
    "location": "123 Main St, NYC",
    "phone": "+1-555-0100",
    "email": "owner@bluemoon.com"
  },
  "onboardingStatus": "in_progress",
  "googleConnected": false
}
```

---

### POST /api/onboarding/form
Submit onboarding form data.

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "sessionId": "sess_1234567890",
  "restaurantName": "The Blue Moon Bistro",
  "location": "123 Main St, New York, NY 10001",
  "phone": "+1-555-0100",
  "email": "owner@bluemoon.com"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/onboarding/form \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "sess_1234567890",
    "restaurantName": "The Blue Moon",
    "location": "123 Main St, NYC",
    "phone": "+1-555-0100",
    "email": "owner@test.com"
  }'
```

**Response (Success):**
```json
{
  "success": true,
  "customerId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionId": "sess_1234567890",
  "message": "Onboarding form submitted. Proceeding to Google Business connection...",
  "nextStep": "/api/google/auth?sessionId=sess_1234567890"
}
```

**Response (Error):**
```json
{
  "error": "Missing required fields: sessionId, restaurantName, email"
}
```

---

## Google OAuth

### GET /api/google/auth
Start Google OAuth flow - returns authorization URL.

**Parameters:**
- `sessionId` (string): Customer session ID (query parameter)

**Example:**
```bash
curl "http://localhost:3000/api/google/auth?sessionId=sess_1234567890"
```

**Response:**
```json
{
  "success": true,
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...",
  "message": "Redirect user to Google authorization"
}
```

**Usage:**
```html
<!-- In frontend -->
<a href="/api/google/auth?sessionId=sess_1234567890">
  Authorize Google Business
</a>
```

---

### GET /api/google/callback
OAuth callback handler - exchanges code for tokens.

**Parameters:**
- `code` (string): Authorization code from Google
- `state` (string): Session ID (for CSRF protection)
- `error` (string, optional): Error from Google

**Example:** (Google redirects here automatically)
```
http://localhost:3000/api/google/callback?code=4/0AX4XfWg...&state=sess_1234567890
```

**Response (Success):**
```json
{
  "success": true,
  "customerId": "550e8400-e29b-41d4-a716-446655440000",
  "sessionId": "sess_1234567890",
  "message": "Google Business Profile connected successfully!",
  "restaurantName": "The Blue Moon",
  "googleEmail": "owner@gmail.com",
  "nextStep": "/onboarding/success?sessionId=sess_1234567890"
}
```

**Response (Error):**
```json
{
  "error": "Session not found"
}
```

---

### GET /api/google/status/:sessionId
Check if Google is connected for a customer.

**Parameters:**
- `sessionId` (string): Customer session ID

**Example:**
```bash
curl http://localhost:3000/api/google/status/sess_1234567890
```

**Response:**
```json
{
  "googleConnected": true,
  "googleStatus": "connected",
  "restaurantName": "The Blue Moon",
  "email": "owner@bluemoon.com"
}
```

---

## Reviews

### GET /api/reviews/fetch/:sessionId
Manually trigger review fetching from Google Business Profile.

**Parameters:**
- `sessionId` (string): Customer session ID

**Example:**
```bash
curl http://localhost:3000/api/reviews/fetch/sess_1234567890
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Fetched and stored 2 review(s)",
  "reviews": 2
}
```

**Response (Error - Not connected):**
```json
{
  "error": "Google not connected. Please complete onboarding first."
}
```

---

### GET /api/reviews/list/:sessionId
List all reviews for a customer.

**Parameters:**
- `sessionId` (string): Customer session ID
- `limit` (number, optional): Results per page (default: 50)
- `offset` (number, optional): Pagination offset (default: 0)

**Example:**
```bash
curl "http://localhost:3000/api/reviews/list/sess_1234567890?limit=10&offset=0"
```

**Response:**
```json
{
  "success": true,
  "totalCount": 25,
  "limit": 10,
  "offset": 0,
  "reviews": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "customer_id": "550e8400-e29b-41d4-a716-446655440001",
      "platform": "google",
      "review_id": "accounts/123/locations/456/reviews/review1",
      "author": "John Doe",
      "rating": 5,
      "text": "Great food and service!",
      "review_date": "2026-02-13T10:00:00Z",
      "ingested_at": "2026-02-13T12:00:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "customer_id": "550e8400-e29b-41d4-a716-446655440001",
      "platform": "google",
      "review_id": "accounts/123/locations/456/reviews/review2",
      "author": "Jane Smith",
      "rating": 4,
      "text": "Good food, but a bit slow on service.",
      "review_date": "2026-02-12T15:00:00Z",
      "ingested_at": "2026-02-13T12:00:00Z"
    }
  ],
  "stats": {
    "totalReviews": 25,
    "byRating": {
      "5": 18,
      "4": 5,
      "3": 1,
      "2": 1,
      "1": 0
    },
    "averageRating": "4.6"
  }
}
```

---

## Health Check

### GET /health
Simple health check endpoint.

**Example:**
```bash
curl http://localhost:3000/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "maitreo-backend",
  "uptime": 123.456,
  "timestamp": "2026-02-13T22:17:00.000Z"
}
```

---

## Complete Flow Example

### 1. Payment Success (Stripe Webhook)
```bash
# Stripe sends webhook
# → Server creates customer record
# → Customer gets session ID
```

### 2. Onboarding Form
```bash
# User visits: /onboarding.html?sessionId=sess_1234567890
# User fills form with restaurant info
POST /api/onboarding/form
{
  "sessionId": "sess_1234567890",
  "restaurantName": "The Blue Moon",
  "location": "123 Main St, NYC",
  "phone": "+1-555-0100",
  "email": "owner@bluemoon.com"
}
# → Response includes nextStep URL
```

### 3. Google OAuth
```bash
# User clicks "Authorize Google Business"
GET /api/google/auth?sessionId=sess_1234567890
# → Returns Google auth URL
# → User redirected to Google
# → User authorizes
# → Google redirects to callback
GET /api/google/callback?code=...&state=sess_1234567890
# → Token exchanged and encrypted
# → User redirected to success page
```

### 4. Review Fetching
```bash
# Administrator can manually fetch reviews
GET /api/reviews/fetch/sess_1234567890
# → Fetches from Google Business Profile API
# → Stores in database

# List reviews
GET /api/reviews/list/sess_1234567890
# → Returns all reviews with stats
```

---

## Error Codes

| Status | Error | Solution |
|--------|-------|----------|
| 400 | Missing required fields | Check request body |
| 400 | Missing sessionId parameter | Include sessionId in URL |
| 404 | Session not found | Create customer first via webhook |
| 404 | Customer not found | Check sessionId is correct |
| 500 | Failed to save form data | Check Supabase connection |
| 500 | Failed to process Google authorization | Check GOOGLE_CLIENT_ID/SECRET |
| 500 | Failed to fetch reviews | Check Google refresh token |

---

## Testing Tools

### cURL

```bash
# Test health
curl http://localhost:3000/health

# Submit onboarding form
curl -X POST http://localhost:3000/api/onboarding/form \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"test","restaurantName":"Test","location":"123 Main","phone":"+1-555-0100","email":"test@test.com"}'

# Check Google status
curl http://localhost:3000/api/google/status/test

# Fetch reviews
curl http://localhost:3000/api/reviews/fetch/test

# List reviews
curl http://localhost:3000/api/reviews/list/test?limit=10
```

### Postman

1. Create collection "Maitreo"
2. Create requests for each endpoint
3. Set `{{baseUrl}}` = `http://localhost:3000`
4. Set `{{sessionId}}` = `test_session_xxx`

### Stripe CLI

```bash
# Start listener
stripe listen --forward-to localhost:3000/api/stripe/webhook

# Trigger test payment
stripe trigger payment_intent.succeeded
```

---

## Rate Limiting

Current implementation:
- No rate limiting (add in production)
- Stripe handles webhook throttling
- Consider adding:
  - Request rate limits per IP
  - Database connection pooling
  - API key authentication

---

## Monitoring

Check logs with:

```bash
# Local
npm start
# Look for "POST /api/..." messages

# Production (Render)
Dashboard → Logs

# Production (Railway)
railway logs

# Supabase
Dashboard → Database → Query Performance
```

---

## Version

**API Version:** 1.0.0  
**Last Updated:** February 13, 2026  
**Status:** Production Ready ✅
