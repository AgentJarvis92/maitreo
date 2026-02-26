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

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    // Check for authorization errors
    if (authError) {
      console.error('Google OAuth error:', authError);
      return res.redirect(`${frontendUrl}/onboarding-success.html?error=${encodeURIComponent(authError)}`);
    }

    if (!code || !state) {
      return res.redirect(`${frontendUrl}/onboarding-success.html?error=${encodeURIComponent('Missing authorization code')}`);
    }

    const sessionId = state;

    // Find customer by session ID
    const { data: customer, error: findError } = await supabase
      .from('customers')
      .select('id, email')
      .eq('session_id', sessionId)
      .single();

    if (findError || !customer) {
      return res.redirect(`${frontendUrl}/onboarding-success.html?error=${encodeURIComponent('Session not found. Please restart onboarding.')}`);
    }

    // Exchange code for tokens
    const oauth2Client = getOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens || !tokens.refresh_token) {
      return res.redirect(`${frontendUrl}/onboarding-success.html?error=${encodeURIComponent('Failed to get permissions. Please approve all requested permissions.')}`);
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
      return res.redirect(`${frontendUrl}/onboarding-success.html?error=${encodeURIComponent('Failed to save credentials. Please try again.')}`);
    }

    // Redirect to success page
    const successParams = new URLSearchParams({
      success: 'true',
      restaurant: updated.restaurant_name || '',
      email: updated.google_email || ''
    });
    res.redirect(`${frontendUrl}/onboarding-success.html?${successParams.toString()}`);
  } catch (error) {
    console.error('Error handling OAuth callback:', error);
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/onboarding-success.html?error=${encodeURIComponent('Something went wrong. Please try again.')}`);
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

/**
 * GET /api/google/locations/:sessionId
 * List all Google Business locations the customer has access to.
 * Requires Google OAuth to be connected (refresh token stored).
 */
router.get('/locations/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Find customer by session ID
    const { data: customer, error: findError } = await supabase
      .from('customers')
      .select('id, google_refresh_token_encrypted, google_connected, restaurant_name')
      .eq('session_id', sessionId)
      .single();

    if (findError || !customer) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!customer.google_connected || !customer.google_refresh_token_encrypted) {
      return res.status(401).json({ 
        error: 'Google not connected',
        message: 'Please connect your Google Business Profile first.'
      });
    }

    // Decrypt refresh token and get fresh access token
    const refreshToken = decryptToken(customer.google_refresh_token_encrypted);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    let accessToken;
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      accessToken = credentials.access_token;
    } catch (refreshErr) {
      console.error('Token refresh failed:', refreshErr);
      // Mark as disconnected if token is revoked
      await supabase
        .from('customers')
        .update({ google_connected: false, google_status: 'not_connected', updated_at: new Date().toISOString() })
        .eq('id', customer.id);
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Your Google connection has expired. Please reconnect.'
      });
    }

    // Fetch all accounts
    const accountsRes = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    if (!accountsRes.ok) {
      const errText = await accountsRes.text();
      console.error('Failed to fetch Google accounts:', accountsRes.status, errText);
      return res.status(502).json({ 
        error: 'Google API error',
        message: 'Could not retrieve your Google Business accounts. Please try again.'
      });
    }

    const accountsData = await accountsRes.json();
    const accounts = accountsData.accounts || [];

    if (accounts.length === 0) {
      return res.status(200).json({ 
        locations: [],
        message: 'No Google Business accounts found. Make sure you have a Google Business Profile set up.'
      });
    }

    // For each account, fetch locations
    const allLocations = [];

    for (const account of accounts) {
      try {
        const locRes = await fetch(
          `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title,storefrontAddress,websiteUri,phoneNumbers`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!locRes.ok) {
          console.warn(`Failed to fetch locations for ${account.name}: ${locRes.status}`);
          continue;
        }

        const locData = await locRes.json();
        const locations = locData.locations || [];

        for (const loc of locations) {
          const address = loc.storefrontAddress;
          const addressStr = address 
            ? [address.addressLines?.join(', '), address.locality, address.administrativeArea, address.postalCode]
                .filter(Boolean).join(', ')
            : '';

          allLocations.push({
            locationName: loc.name, // e.g., "locations/12345"
            fullResourceName: `${account.name}/${loc.name}`, // e.g., "accounts/123/locations/456"
            title: loc.title || 'Unnamed Location',
            address: addressStr,
            phone: loc.phoneNumbers?.primaryPhone || null,
            website: loc.websiteUri || null,
            accountName: account.accountName || account.name
          });
        }
      } catch (locErr) {
        console.error(`Error fetching locations for account ${account.name}:`, locErr);
      }
    }

    res.json({
      locations: allLocations,
      count: allLocations.length,
      message: allLocations.length === 0 
        ? 'No locations found. Make sure your Google Business Profile has at least one location.'
        : `Found ${allLocations.length} location(s).`
    });

  } catch (error) {
    console.error('Error fetching locations:', error);
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

/**
 * POST /api/google/locations/:sessionId
 * Save the selected Google Business location for a customer.
 * Body: { locationName: "accounts/123/locations/456" }
 */
router.post('/locations/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { locationName } = req.body;

    if (!locationName) {
      return res.status(400).json({ error: 'Missing locationName in request body' });
    }

    // Validate format: should look like "accounts/XXX/locations/YYY"
    if (!/^accounts\/\d+\/locations\/\d+$/.test(locationName)) {
      return res.status(400).json({ 
        error: 'Invalid locationName format',
        message: 'Expected format: accounts/{accountId}/locations/{locationId}'
      });
    }

    // Find customer by session ID
    const { data: customer, error: findError } = await supabase
      .from('customers')
      .select('id, google_refresh_token_encrypted, google_connected')
      .eq('session_id', sessionId)
      .single();

    if (findError || !customer) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!customer.google_connected || !customer.google_refresh_token_encrypted) {
      return res.status(401).json({ 
        error: 'Google not connected',
        message: 'Please connect your Google Business Profile first.'
      });
    }

    // Verify the customer actually has access to this location
    const refreshToken = decryptToken(customer.google_refresh_token_encrypted);
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    let accessToken;
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      accessToken = credentials.access_token;
    } catch (refreshErr) {
      console.error('Token refresh failed:', refreshErr);
      await supabase
        .from('customers')
        .update({ google_connected: false, google_status: 'not_connected', updated_at: new Date().toISOString() })
        .eq('id', customer.id);
      return res.status(401).json({ 
        error: 'Token expired',
        message: 'Your Google connection has expired. Please reconnect.'
      });
    }

    // Extract account name from locationName
    const accountMatch = locationName.match(/^(accounts\/\d+)\//);
    const accountName = accountMatch ? accountMatch[1] : null;
    const locationPart = locationName.replace(/^accounts\/\d+\//, ''); // "locations/XXX"

    // Verify location exists and customer has access
    const verifyRes = await fetch(
      `https://mybusinessbusinessinformation.googleapis.com/v1/${locationName}?readMask=name,title`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!verifyRes.ok) {
      if (verifyRes.status === 403) {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'You do not have access to this Google Business location.'
        });
      }
      if (verifyRes.status === 404) {
        return res.status(404).json({ 
          error: 'Location not found',
          message: 'This Google Business location does not exist.'
        });
      }
      const errText = await verifyRes.text();
      console.error('Location verification failed:', verifyRes.status, errText);
      return res.status(502).json({ 
        error: 'Google API error',
        message: 'Could not verify the location. Please try again.'
      });
    }

    const locationData = await verifyRes.json();

    // Save to customer record
    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update({
        google_location_name: locationName,
        google_location_id: locationPart,
        updated_at: new Date().toISOString()
      })
      .eq('id', customer.id)
      .select('id, session_id, restaurant_name, google_location_name')
      .single();

    if (updateError) {
      console.error('Error saving location:', updateError);
      return res.status(500).json({ error: 'Failed to save location selection' });
    }

    console.log(`✅ Location saved for customer ${customer.id}: ${locationName} (${locationData.title})`);

    res.json({
      success: true,
      message: `Location "${locationData.title}" has been selected.`,
      location: {
        locationName: locationName,
        title: locationData.title
      }
    });

  } catch (error) {
    console.error('Error saving location:', error);
    res.status(500).json({ error: 'Failed to save location selection' });
  }
});

module.exports = router;
