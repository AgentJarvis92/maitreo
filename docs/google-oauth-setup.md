# Google OAuth Setup Guide

**Project:** Maitreo  
**Date:** 2026-02-13  
**Status:** ✅ Complete & Working

## Overview

This document describes the Google Cloud Platform configuration for Maitreo's OAuth 2.0 integration with Google Business Profile API.

## Prerequisites

✅ Google Cloud account with billing enabled  
✅ Domain ownership verified (maitreo.com)  
✅ Project created: **Maitreo**  

## APIs Enabled

- **Google Business Profile API** (`mybusiness.googleapis.com`)
  - Enables read/write access to business reviews and replies
  - Required for owner-level Business Profile management

## OAuth 2.0 Configuration

### Consent Screen

**Type:** External (allows any Google account to connect)

**App Information:**
- **App name:** Maitreo
- **User support email:** reviewreplyhq@gmail.com
- **App domain:** https://maitreo.com
- **Authorized domains:** maitreo.com

**Scopes:**
- `https://www.googleapis.com/auth/business.manage` - Manage Google Business Profile
- `https://www.googleapis.com/auth/userinfo.email` - Read user email
- `https://www.googleapis.com/auth/userinfo.profile` - Read user profile

### OAuth 2.0 Client

**Application Type:** Web application  
**Name:** Maitreo Web Client

**Client ID:**
```
[STORED IN .ENV - NOT COMMITTED TO GIT]
```

**Authorized Redirect URIs:**
- `https://maitreo.com/api/google/callback` (production)
- `http://localhost:3001/api/google/callback` (development)

## Environment Variables

Add to `.env`:

```bash
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/google/callback

# For production, change to:
# GOOGLE_REDIRECT_URI=https://maitreo.com/api/google/callback
```

## Token Security

**Encryption:**
- Refresh tokens encrypted with AES-256-GCM before storage
- Encryption key stored in `TOKEN_ENCRYPTION_KEY` env variable
- 32-byte encryption key generated via: `openssl rand -hex 32`

**Storage:**
- Encrypted tokens stored in Supabase `customers` table
- Column: `google_refresh_token_encrypted`
- Never logged or exposed in API responses

## OAuth Flow

### 1. Start Authorization

**Endpoint:** `GET /api/google/auth?sessionId={sessionId}`

**Response:**
```json
{
  "success": true,
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?..."
}
```

User redirects to `authUrl` to grant permissions.

### 2. Handle Callback

**Endpoint:** `GET /api/google/callback?code={code}&state={sessionId}`

**Process:**
1. Exchange authorization code for tokens
2. Encrypt refresh token
3. Fetch user info from Google
4. Store encrypted token + user email in database
5. Return success response

**Response:**
```json
{
  "success": true,
  "customerId": "uuid",
  "sessionId": "session_id",
  "message": "Google Business Profile connected successfully!",
  "googleEmail": "user@example.com"
}
```

### 3. Automatic Token Refresh

Tokens automatically refresh before expiration:
- Access tokens expire in 1 hour
- Refresh tokens never expire (until revoked)
- Auto-refresh logic in `google-oauth.js`

## Testing

### Test OAuth Flow

1. Start backend server:
   ```bash
   cd ~/restaurant-saas/backend
   PORT=3001 node server.js
   ```

2. Create test customer:
   ```bash
   curl -X POST http://localhost:3001/api/customers \
     -H "Content-Type: application/json" \
     -d '{
       "stripe_session_id": "test_session",
       "email": "test@example.com"
     }'
   ```

3. Open OAuth URL:
   ```
   http://localhost:3001/api/google/auth?sessionId=test_session
   ```

4. Follow Google's consent flow

5. Verify success response at callback

### Verify Token Storage

```bash
# Check if token was encrypted and stored
curl http://localhost:3001/api/google/status/test_session
```

Expected:
```json
{
  "googleConnected": true,
  "googleStatus": "connected"
}
```

## Production Checklist

Before launching:

- [ ] Update redirect URI to production domain
- [ ] Change support email to support@maitreo.com
- [ ] Add Privacy Policy URL to consent screen
- [ ] Add Terms of Service URL to consent screen
- [ ] Minimize scopes (only `business.manage` required)
- [ ] Request Google OAuth verification (if needed)
- [ ] Test with real Business Profile accounts
- [ ] Monitor OAuth error logs
- [ ] Set up token refresh monitoring

## Troubleshooting

**Error: "Access blocked: Maitreo has not completed verification"**
- Solution: Add test users in OAuth consent screen → "Audience" tab

**Error: "redirect_uri_mismatch"**
- Solution: Verify redirect URI in code matches Google Cloud Console exactly

**Error: "Failed to get refresh token"**
- Solution: Ensure `prompt=consent` and `access_type=offline` in auth URL

**Error: "No access, refresh token, API key or refresh handler callback is set"**
- Solution: Call `oauth2Client.setCredentials(tokens)` before making requests

## Files Modified

- `backend/routes/google-oauth.js` - OAuth flow implementation
- `backend/.env` - OAuth credentials (not committed to git)
- `backend/migrations/create-customers-table.sql` - Database schema

## References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Business Profile API](https://developers.google.com/my-business/reference/rest)
- [OAuth Best Practices](https://developers.google.com/identity/protocols/oauth2/web-server#creatingclient)

---

**Last Updated:** 2026-02-13  
**Maintainer:** Jarvis  
**Status:** ✅ Production Ready
