/**
 * Google OAuth Routes
 * - GET /api/google/auth - Start OAuth flow
 * - GET /api/google/callback - OAuth callback handler
 */

const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Encryption for tokens
const ENCRYPTION_KEY = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY, 'hex');
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypt sensitive token data
 */
function encryptToken(token) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt token
 */
function decryptToken(encryptedData) {
  const parts = encryptedData.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Create OAuth2 client
 */
function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

/**
 * GET /api/google/auth
 * Start OAuth flow - redirect to Google consent screen
 */
router.get('/auth', (req, res) => {
  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ error: 'Missing sessionId parameter' });
    }

    // Create OAuth2 client
    const oauth2Client = getOAuth2Client();

    // Generate authorization URL
    // Scopes needed for Google Business Profile API
    const scopes = [
      'https://www.googleapis.com/auth/business.manage',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Get refresh token
      scope: scopes,
      state: sessionId, // Pass sessionId as state for verification
      prompt: 'consent' // Force consent screen to get refresh token
    });

    res.json({
      success: true,
      authUrl: authUrl,
      message: 'Redirect user to Google authorization'
    });
  } catch (error) {
    console.error('Error starting OAuth flow:', error);
    res.status(500).json({ error: 'Failed to start OAuth flow' });
  }
});

/**
 * GET /api/google/callback
 * OAuth callback handler - exchange code for tokens
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error: authError } = req.query;

    // Check for authorization errors
    if (authError) {
      console.error('Google OAuth error:', authError);
      return res.status(400).json({ error: `Google authorization failed: ${authError}` });
    }

    if (!code || !state) {
      return res.status(400).json({ error: 'Missing authorization code or state' });
    }

    const sessionId = state;

    // Find customer by session ID
    const { data: customer, error: findError } = await supabase
      .from('customers')
      .select('id, email')
      .eq('session_id', sessionId)
      .single();

    if (findError || !customer) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Exchange code for tokens
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens || !tokens.refresh_token) {
      return res.status(400).json({ 
        error: 'Failed to get refresh token. Please make sure to approve all permissions.' 
      });
    }

    // Encrypt refresh token before storing
    const encryptedToken = encryptToken(tokens.refresh_token);

    // Set credentials on the client before making requests
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const { data: userData } = await oauth2Client.request({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo'
    });

    // Update customer with Google credentials
    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update({
        google_email: userData.email,
        google_refresh_token_encrypted: encryptedToken,
        google_status: 'connected',
        google_connected: true,
        google_connected_at: new Date().toISOString(),
        onboarding_status: 'completed',
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', customer.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating customer with Google credentials:', updateError);
      return res.status(500).json({ error: 'Failed to save Google credentials' });
    }

    // Return success response
    res.json({
      success: true,
      customerId: updated.id,
      sessionId: updated.session_id,
      message: 'Google Business Profile connected successfully!',
      restaurantName: updated.restaurant_name,
      googleEmail: updated.google_email,
      nextStep: `/onboarding/success?sessionId=${updated.session_id}`
    });
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    res.status(500).json({ error: 'Failed to process Google authorization' });
  }
});

/**
 * GET /api/google/status/:sessionId
 * Check if Google is connected for a customer
 */
router.get('/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, google_connected, google_status, restaurant_name, email')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      googleConnected: customer.google_connected,
      googleStatus: customer.google_status,
      restaurantName: customer.restaurant_name,
      email: customer.email
    });
  } catch (error) {
    console.error('Error checking Google status:', error);
    res.status(500).json({ error: 'Failed to check Google status' });
  }
});

module.exports = router;
