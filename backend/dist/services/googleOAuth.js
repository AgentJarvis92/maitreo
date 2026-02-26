/**
 * Google OAuth 2.0 Service for Business Profile API
 * Handles authorization flow, token exchange, storage, and refresh.
 */
import { query } from '../db/client.js';
import { encryptToken, decryptToken } from './tokenEncryption.js';
import crypto from 'crypto';
// OAuth configuration
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = ['https://www.googleapis.com/auth/business.manage'];
// In-memory state store (short-lived, for CSRF protection)
const pendingStates = new Map();
function getClientId() {
    const id = process.env.GOOGLE_CLIENT_ID;
    if (!id)
        throw new Error('GOOGLE_CLIENT_ID not set');
    return id;
}
function getClientSecret() {
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    if (!secret)
        throw new Error('GOOGLE_CLIENT_SECRET not set');
    return secret;
}
function getRedirectUri() {
    return process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback';
}
/**
 * Generate the Google OAuth consent URL.
 * Returns the URL to redirect the user to.
 */
export function generateAuthUrl(restaurantId) {
    const state = crypto.randomBytes(32).toString('hex');
    // Store state → restaurantId mapping (expires in 10 min)
    pendingStates.set(state, {
        restaurantId,
        expiresAt: Date.now() + 10 * 60 * 1000,
    });
    // Clean up expired states
    for (const [key, val] of pendingStates) {
        if (val.expiresAt < Date.now())
            pendingStates.delete(key);
    }
    const params = new URLSearchParams({
        client_id: getClientId(),
        redirect_uri: getRedirectUri(),
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline', // Gets refresh token
        prompt: 'consent', // Force consent to always get refresh token
        state,
    });
    console.log(`🔐 [OAuth] Generated auth URL for restaurant ${restaurantId}`);
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}
/**
 * Handle the OAuth callback - exchange code for tokens and store them.
 */
export async function handleCallback(code, state) {
    // Validate state
    const pending = pendingStates.get(state);
    if (!pending) {
        console.error('🔐 [OAuth] Invalid or expired state parameter');
        return { restaurantId: '', success: false, error: 'Invalid or expired state parameter' };
    }
    if (pending.expiresAt < Date.now()) {
        pendingStates.delete(state);
        console.error('🔐 [OAuth] State expired');
        return { restaurantId: pending.restaurantId, success: false, error: 'Authorization session expired' };
    }
    const { restaurantId } = pending;
    pendingStates.delete(state);
    try {
        // Exchange authorization code for tokens
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: getClientId(),
                client_secret: getClientSecret(),
                redirect_uri: getRedirectUri(),
                grant_type: 'authorization_code',
            }),
        });
        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) {
            console.error('🔐 [OAuth] Token exchange failed:', tokenData);
            return { restaurantId, success: false, error: tokenData.error_description || tokenData.error || 'Token exchange failed' };
        }
        const { access_token, refresh_token, expires_in } = tokenData;
        if (!access_token) {
            return { restaurantId, success: false, error: 'No access token received' };
        }
        // Get the Google Business account ID
        const accountId = await fetchAccountId(access_token);
        // Store tokens encrypted in database
        await storeTokens(restaurantId, access_token, refresh_token, expires_in, accountId);
        console.log(`✅ [OAuth] Tokens stored for restaurant ${restaurantId}, account ${accountId}`);
        return { restaurantId, success: true };
    }
    catch (error) {
        console.error('🔐 [OAuth] Callback error:', error);
        return { restaurantId, success: false, error: error.message };
    }
}
/**
 * Fetch the Google Business account ID for the authenticated user.
 */
async function fetchAccountId(accessToken) {
    const response = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Failed to fetch account ID: ${response.status} ${err}`);
    }
    const data = await response.json();
    const accounts = data.accounts || [];
    if (accounts.length === 0) {
        throw new Error('No Google Business accounts found for this user');
    }
    // Use first account (most businesses have one)
    return accounts[0].name; // e.g., "accounts/123456789"
}
/**
 * Store encrypted tokens in the database.
 */
async function storeTokens(restaurantId, accessToken, refreshToken, expiresIn, accountId) {
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    await query(`UPDATE restaurants SET
      google_access_token = $1,
      google_refresh_token = COALESCE($2, google_refresh_token),
      google_token_expires_at = $3,
      google_account_id = $4,
      updated_at = NOW()
    WHERE id = $5`, [
        encryptToken(accessToken),
        refreshToken ? encryptToken(refreshToken) : null,
        expiresAt.toISOString(),
        accountId,
        restaurantId,
    ]);
}
/**
 * Get a valid access token for a restaurant, auto-refreshing if needed.
 * Returns null if no tokens stored or refresh fails.
 */
export async function getValidAccessToken(restaurantId) {
    const result = await query(`SELECT google_access_token, google_refresh_token, google_token_expires_at, google_account_id
     FROM restaurants WHERE id = $1`, [restaurantId]);
    if (result.rows.length === 0)
        return null;
    const row = result.rows[0];
    if (!row.google_access_token || !row.google_refresh_token) {
        console.warn(`⚠️ [OAuth] No Google tokens for restaurant ${restaurantId}`);
        return null;
    }
    const expiresAt = new Date(row.google_token_expires_at);
    const now = new Date();
    const fiveMinFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    // Token still valid (expires in >5 min)
    if (expiresAt > fiveMinFromNow) {
        return decryptToken(row.google_access_token);
    }
    // Token expired or expiring soon — refresh
    console.log(`🔄 [OAuth] Refreshing token for restaurant ${restaurantId}`);
    try {
        const refreshToken = decryptToken(row.google_refresh_token);
        const response = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: getClientId(),
                client_secret: getClientSecret(),
                refresh_token: refreshToken,
                grant_type: 'refresh_token',
            }),
        });
        const data = await response.json();
        if (!response.ok) {
            console.error(`❌ [OAuth] Token refresh failed for ${restaurantId}:`, data);
            // If refresh token revoked, clear tokens
            if (data.error === 'invalid_grant') {
                await query(`UPDATE restaurants SET google_access_token = NULL, google_refresh_token = NULL, google_token_expires_at = NULL WHERE id = $1`, [restaurantId]);
                console.error(`🚨 [OAuth] Refresh token revoked for ${restaurantId} — tokens cleared. Owner must re-authorize.`);
            }
            return null;
        }
        // Store new access token (refresh token stays the same unless Google rotates it)
        await storeTokens(restaurantId, data.access_token, data.refresh_token || null, data.expires_in, row.google_account_id);
        console.log(`✅ [OAuth] Token refreshed for restaurant ${restaurantId}`);
        return data.access_token;
    }
    catch (error) {
        console.error(`❌ [OAuth] Refresh error for ${restaurantId}:`, error);
        return null;
    }
}
/**
 * Get the Google account ID for a restaurant.
 */
export async function getGoogleAccountId(restaurantId) {
    const result = await query(`SELECT google_account_id FROM restaurants WHERE id = $1`, [restaurantId]);
    return result.rows[0]?.google_account_id || null;
}
//# sourceMappingURL=googleOAuth.js.map