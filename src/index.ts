/**
 * Restaurant SaaS Backend - Main Entry Point
 * 
 * This is a simple HTTP server for health checks and manual job triggers.
 * The actual jobs run on scheduled cron tasks.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pool from './db/client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
import { ingestionJob } from './jobs/ingestion.js';
import { newsletterJob } from './jobs/newsletter.js';
import { reviewMonitor } from './jobs/reviewMonitor.js';
import { runScheduledDigests, generateDigest } from './jobs/weeklyDigest.js';
import { responsePoster } from './services/responsePoster.js';
import { handleSmsWebhook, handleStatusCallback } from './sms/webhookHandler.js';
import { handleStripeWebhook } from './routes/webhooks.js';
import { createCheckoutSession } from './services/stripeService.js';
import { smsService } from './sms/smsService.js';
import { twilioClient } from './sms/twilioClient.js';
import { processOnboarding } from './services/onboarding.js';
import { sendOtp, verifyOtp } from './services/otpService.js';
import { generateAuthUrl, handleCallback } from './services/googleOAuth.js';
import { fetchReviews, fetchLocations } from './services/googleBusinessProfile.js';

dotenv.config();

const PORT = process.env.PORT || 3000;

// ─── Rate Limiting ─────────────────────────────────────────────────
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10; // requests per minute (sensitive endpoints)
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// Separate, more lenient limiter for webhook endpoints (DoS protection only)
const webhookRateLimitMap = new Map<string, { count: number; resetAt: number }>();
const WEBHOOK_RATE_LIMIT = 100; // requests per minute

function isWebhookRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = webhookRateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    webhookRateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > WEBHOOK_RATE_LIMIT;
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now >= entry.resetAt) rateLimitMap.delete(ip);
  }
}, 5 * 60_000);

function getClientIp(req: http.IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  // Quick ping (no db required)
  if (url.pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, ts: new Date().toISOString() }));
    return;
  }

  // Health check
  if (url.pathname === '/health') {
    try {
      await pool.query('SELECT 1');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        database: 'connected'
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'unhealthy', 
        error: 'Database connection failed' 
      }));
    }
    return;
  }

  // Rate limiting for sensitive endpoints
  const rateLimitedPaths = ['/onboarding', '/onboarding/register', '/onboarding/otp/send', '/onboarding/otp/verify', '/api/checkout'];
  if (rateLimitedPaths.includes(url.pathname) && req.method === 'POST') {
    const clientIp = getClientIp(req);
    if (isRateLimited(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
      return;
    }
  }

  // API_SECRET gate for /jobs/* endpoints
  if (url.pathname.startsWith('/jobs/') && req.method === 'POST') {
    const apiSecret = process.env.API_SECRET;
    if (apiSecret) {
      const authHeader = req.headers['authorization'] || '';
      if (authHeader !== `Bearer ${apiSecret}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }
  }

  // Onboarding form submission
  if (url.pathname === '/onboarding' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', async () => {
      try {
        // Parse form data or JSON
        let data;
        const contentType = req.headers['content-type'] || '';
        
        if (contentType.includes('application/json')) {
          data = JSON.parse(body);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          // Parse URL-encoded form data
          const params = new URLSearchParams(body);
          data = {
            name: params.get('name'),
            address: params.get('address'),
            phone: params.get('phone'),
            email: params.get('email')
          };
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            message: 'Invalid content type' 
          }));
          return;
        }
        
        const result = await processOnboarding(data);
        
        res.writeHead(result.success ? 200 : 400, { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(result));
        
      } catch (error: any) {
        console.error('Onboarding endpoint error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          message: 'Server error',
          error: error.message 
        }));
      }
    });
    
    return;
  }

  // CORS preflight for all onboarding endpoints
  if (url.pathname.startsWith('/onboarding') && req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const CORS_HEADERS = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  };

  // Helper: read JSON body
  function readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
      req.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
      req.on('error', reject);
    });
  }

  // Onboarding Step 1: Register restaurant
  if (url.pathname === '/onboarding/register' && req.method === 'POST') {
    try {
      const data = await readBody(req);
      const result = await processOnboarding(data);
      res.writeHead(result.success ? 200 : 400, CORS_HEADERS);
      res.end(JSON.stringify(result));
    } catch (error: any) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, message: 'Server error' }));
    }
    return;
  }

  // Onboarding Step 2: Send OTP
  if (url.pathname === '/onboarding/otp/send' && req.method === 'POST') {
    try {
      const { restaurantId, phone } = await readBody(req);
      // Normalize phone to E.164
      const digits = phone.replace(/\D/g, '');
      const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits[0] === '1' ? `+${digits}` : phone;
      const result = await sendOtp(restaurantId, e164);
      res.writeHead(result.success ? 200 : 400, CORS_HEADERS);
      res.end(JSON.stringify(result));
    } catch (error: any) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, message: 'Failed to send code' }));
    }
    return;
  }

  // Onboarding Step 2: Verify OTP
  if (url.pathname === '/onboarding/otp/verify' && req.method === 'POST') {
    try {
      const { restaurantId, code } = await readBody(req);
      const result = await verifyOtp(restaurantId, code);
      res.writeHead(result.success ? 200 : 400, CORS_HEADERS);
      res.end(JSON.stringify(result));
    } catch (error: any) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, message: 'Verification failed' }));
    }
    return;
  }

  // Onboarding Step 3: Create Stripe Checkout Session
  if (url.pathname === '/onboarding/stripe/create-session' && req.method === 'POST') {
    try {
      const { restaurantId } = await readBody(req);
      // Get restaurant email
      const restaurant = await pool.query('SELECT owner_email FROM restaurants WHERE id = $1', [restaurantId]);
      const email = restaurant.rows[0]?.owner_email;
      const baseUrl = process.env.LANDING_URL || 'https://maitreo.com';

      try {
        const session = await createCheckoutSession({
          restaurantId,
          customerEmail: email,
          successUrl: `${baseUrl}/onboarding.html?step=4&rid=${restaurantId}`,
          cancelUrl: `${baseUrl}/onboarding.html?step=3&rid=${restaurantId}`
        });
        res.writeHead(200, CORS_HEADERS);
        res.end(JSON.stringify({ url: session.url }));
      } catch (stripeErr: any) {
        // If Stripe not configured, stub it
        console.warn('Stripe not available, stubbing checkout:', stripeErr.message);
        res.writeHead(200, CORS_HEADERS);
        res.end(JSON.stringify({ stub: true, message: 'Stripe not configured yet — skipping to next step' }));
      }
    } catch (error: any) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, message: 'Could not create checkout session' }));
    }
    return;
  }

  // Onboarding Step 5: Complete onboarding
  if (url.pathname === '/onboarding/complete' && req.method === 'POST') {
    try {
      const { restaurantId } = await readBody(req);
      // Get restaurant info
      const result = await pool.query('SELECT owner_phone, name FROM restaurants WHERE id = $1', [restaurantId]);
      const restaurant = result.rows[0];

      if (restaurant?.owner_phone) {
        try {
          await twilioClient.sendSms(
            restaurant.owner_phone,
            `Welcome to Maitreo! Your reviews are now being monitored 24/7. Reply HELP for commands.`
          );
        } catch (smsErr) {
          console.error('Welcome SMS failed:', smsErr);
        }
      }

      // Mark onboarding complete
      try {
        await pool.query('UPDATE restaurants SET onboarding_complete = true WHERE id = $1', [restaurantId]);
      } catch (dbErr) {
        console.error('Failed to mark onboarding complete:', dbErr);
      }

      // Trigger initial review poll (non-blocking)
      reviewMonitor.runOnce().catch(console.error);

      res.writeHead(200, CORS_HEADERS);
      res.end(JSON.stringify({ success: true, message: 'Onboarding complete!' }));
    } catch (error: any) {
      res.writeHead(500, CORS_HEADERS);
      res.end(JSON.stringify({ success: false, message: 'Error completing onboarding' }));
    }
    return;
  }

  // Twilio SMS webhook (incoming messages) — new path + legacy path
  if ((url.pathname === '/webhooks/twilio/inbound' || url.pathname === '/sms/webhook') && req.method === 'POST') {
    await handleSmsWebhook(req, res);
    return;
  }

  // Twilio delivery status callback
  if (url.pathname === '/webhooks/twilio/status' && req.method === 'POST') {
    await handleStatusCallback(req, res);
    return;
  }

  // Stripe webhook
  if (url.pathname === '/webhooks/stripe' && req.method === 'POST') {
    if (isWebhookRateLimited(getClientIp(req))) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    await handleStripeWebhook(req, res);
    return;
  }

  // Create Checkout Session (start subscription)
  if (url.pathname === '/api/checkout' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { restaurantId, email } = JSON.parse(body);
        if (!restaurantId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing restaurantId' }));
          return;
        }
        const session = await createCheckoutSession({
          restaurantId,
          customerEmail: email,
        });
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify({ url: session.url, sessionId: session.id }));
      } catch (err: any) {
        console.error('Checkout session error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // CORS preflight for checkout
  if (url.pathname === '/api/checkout' && req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Send mock review alert (for testing SMS command flow) — dev only
  if (url.pathname === '/sms/test/mock-alert' && req.method === 'POST') {
    if (process.env.NODE_ENV === 'production') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { phone, restaurantId } = JSON.parse(body);
        if (!phone) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing phone' }));
          return;
        }
        await smsService.sendMockReviewAlert(phone, restaurantId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Mock review alert sent' }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Manual trigger: review monitor poll
  if (url.pathname === '/jobs/reviews/poll' && req.method === 'POST') {
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'accepted', message: 'Review poll started' }));
    reviewMonitor.runOnce().catch(console.error);
    return;
  }

  // Manual trigger: post approved responses
  if (url.pathname === '/jobs/responses/post' && req.method === 'POST') {
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'accepted', message: 'Response posting started' }));
    responsePoster.processApprovedDrafts().catch(console.error);
    return;
  }

  // Manual trigger for ingestion job (for testing)
  if (url.pathname === '/jobs/ingestion/run' && req.method === 'POST') {
    try {
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'accepted', 
        message: 'Ingestion job started' 
      }));
      
      // Run job asynchronously
      ingestionJob.run().catch(console.error);
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Manual trigger for newsletter job (for testing)
  if (url.pathname === '/jobs/newsletter/run' && req.method === 'POST') {
    try {
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'accepted', 
        message: 'Newsletter job started' 
      }));
      
      // Run job asynchronously
      newsletterJob.run().catch(console.error);
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // Manual digest trigger — POST /jobs/digest/run?restaurant_id=xxx&force=true
  if (url.pathname === '/jobs/digest/run' && req.method === 'POST') {
    const restaurantId = url.searchParams.get('restaurant_id') || undefined;
    const force = url.searchParams.get('force') === 'true';
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'accepted', message: 'Digest job started', restaurantId, force }));
    generateDigest(restaurantId, force).catch(err =>
      console.error('[Digest] Manual trigger error:', err.message)
    );
    return;
  }

  // OAuth: Start Google authorization
  if (url.pathname === '/auth/google/start' && req.method === 'GET') {
    const restaurantId = url.searchParams.get('restaurant_id');
    const returnUrl = url.searchParams.get('return_url');
    if (!restaurantId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing restaurant_id parameter' }));
      return;
    }
    // Store return URL in database for post-callback redirect
    if (returnUrl) {
      await pool.query(
        `INSERT INTO oauth_states (restaurant_id, return_url, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
         ON CONFLICT (restaurant_id) DO UPDATE SET return_url = $2, expires_at = NOW() + INTERVAL '10 minutes'`,
        [restaurantId, returnUrl]
      ).catch(err => console.warn('Failed to store OAuth return URL:', err));
    }
    try {
      const authUrl = await generateAuthUrl(restaurantId);
      res.writeHead(302, { Location: authUrl });
      res.end();
    } catch (error: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
    return;
  }

  // OAuth: Google callback
  if (url.pathname === '/auth/google/callback' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>Authorization Denied</h1><p>${error}</p><p>You can close this window.</p>`);
      return;
    }

    if (!code || !state) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing code or state parameter' }));
      return;
    }

    try {
      const result = await handleCallback(code, state);
      if (result.success) {
        // Check for onboarding return URL from database
        const rid = (result as any).restaurantId;
        let returnUrl: string | null = null;
        if (rid) {
          const oauthResult = await pool.query(
            `DELETE FROM oauth_states WHERE restaurant_id = $1 AND expires_at > NOW() RETURNING return_url`,
            [rid]
          ).catch(() => ({ rows: [] }));
          returnUrl = oauthResult.rows[0]?.return_url || null;
        }
        if (returnUrl) {
          res.writeHead(302, { Location: returnUrl });
          res.end();
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<h1>✅ Google Connected!</h1><p>Your Google Business Profile is now linked to Maitreo.</p><p>You can close this window.</p>`);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`<h1>❌ Connection Failed</h1><p>${result.error}</p><p>Please try again.</p>`);
      }
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Fetch reviews for a connected restaurant
  if (url.pathname === '/api/reviews/fetch' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { restaurantId, locationName } = JSON.parse(body);
        if (!restaurantId || !locationName) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing restaurantId or locationName' }));
          return;
        }
        const result = await fetchReviews(restaurantId, locationName);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Get locations for a connected restaurant
  if (url.pathname === '/api/locations' && req.method === 'GET') {
    const restaurantId = url.searchParams.get('restaurant_id');
    if (!restaurantId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing restaurant_id' }));
      return;
    }
    try {
      const locations = await fetchLocations(restaurantId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ locations }));
    } catch (err: any) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static files from public/ directory
  const safePath = path.normalize(url.pathname).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, safePath === '/' ? 'index.html' : safePath);
  if (filePath.startsWith(PUBLIC_DIR)) {
    try {
      const content = fs.readFileSync(filePath);
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
      return;
    } catch {}
  }

  // Fallback: serve landing page for unmatched GET routes
  if (req.method === 'GET') {
    try {
      const landing = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(landing);
      return;
    } catch {}
  }

  // 404 for API routes
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// ─── Startup env var validation ──────────────────────────────────────
const REQUIRED_ENV = ['DATABASE_URL', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY', 'API_SECRET', 'TOKEN_ENCRYPTION_KEY'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingEnv.join(', ')}`);
  if (process.env.NODE_ENV === 'production') process.exit(1);
  else console.warn('⚠️  Continuing in dev mode with missing env vars');
}
if (!process.env.OPENAI_API_KEY) console.warn('⚠️  OPENAI_API_KEY not set — digest pattern analysis will be skipped');
if (!process.env.GOOGLE_PLACES_API_KEY) console.warn('⚠️  GOOGLE_PLACES_API_KEY not set — competitor scan/auto-seed disabled');

server.listen(PORT, () => {
  console.log('🚀 Restaurant SaaS Backend Started');
  console.log(`   Port: ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  /health                  - Health check`);
  console.log(`   POST /onboarding              - New restaurant sign-up`);
  console.log(`   POST /webhooks/twilio/inbound  - Twilio incoming SMS webhook`);
  console.log(`   POST /webhooks/twilio/status   - Twilio delivery status callback`);
  console.log(`   POST /sms/test/mock-alert      - Send mock review alert (testing)`);
  console.log(`   POST /jobs/reviews/poll       - Trigger review poll`);
  console.log(`   POST /jobs/responses/post     - Post approved responses`);
  console.log(`   POST /jobs/ingestion/run      - Trigger ingestion job`);
  console.log(`   POST /jobs/newsletter/run     - Trigger newsletter job`);
  console.log(`   POST /jobs/digest/run         - Trigger digest (add ?restaurant_id=&force=true)`);
  console.log(`   GET  /auth/google/start       - Start Google OAuth flow`);
  console.log(`   GET  /auth/google/callback    - Google OAuth callback`);
  console.log(`   GET  /api/locations           - List Google Business locations`);
  console.log(`   POST /api/reviews/fetch       - Fetch reviews from GBP API`);
  console.log(`\n💡 Scheduled jobs should run via cron (see README.md)`);

  // Start review monitor (polls every 5 min)
  if (process.env.ENABLE_REVIEW_MONITOR !== 'false') {
    reviewMonitor.start().catch(console.error);
  }

  // Start response poster loop (checks every minute)
  if (process.env.ENABLE_RESPONSE_POSTER !== 'false') {
    setInterval(() => {
      responsePoster.processApprovedDrafts().catch(console.error);
    }, 60_000);
  }

  // Hourly digest scheduler — fires Sunday 9AM per restaurant timezone
  if (process.env.ENABLE_DIGEST !== 'false') {
    const runDigestCheck = () => {
      runScheduledDigests().catch(err =>
        console.error('[Digest] Scheduler error:', err.message)
      );
    };
    // Align to top of next hour, then tick every hour
    const msUntilNextHour = (60 - new Date().getMinutes()) * 60_000 - new Date().getSeconds() * 1000;
    setTimeout(() => {
      runDigestCheck();
      setInterval(runDigestCheck, 60 * 60_000);
    }, msUntilNextHour);
    console.log(`   ⏰ Digest scheduler active (next check in ~${Math.round(msUntilNextHour / 60000)} min)`);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
});
