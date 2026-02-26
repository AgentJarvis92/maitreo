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
const MIME_TYPES = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
import { ingestionJob } from './jobs/ingestion.js';
import { newsletterJob } from './jobs/newsletter.js';
import { reviewMonitor } from './jobs/reviewMonitor.js';
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
// Rate limiting
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX = 10;
function isRateLimited(key) {
    const now = Date.now();
    let entry = rateLimitMap.get(key);
    if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
        entry = { start: now, count: 1 };
        rateLimitMap.set(key, entry);
        return false;
    }
    entry.count++;
    return entry.count > RATE_LIMIT_MAX;
}
// Job auth middleware
function validateJobAuth(req) {
    const secret = process.env.API_SECRET || process.env.JOB_SECRET;
    if (!secret) return true; // no secret configured = allow (dev)
    const authHeader = req.headers.authorization || '';
    const querySecret = new URL(req.url || '/', `http://${req.headers.host}`).searchParams.get('secret');
    return authHeader === `Bearer ${secret}` || querySecret === secret;
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
        }
        catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'unhealthy',
                error: 'Database connection failed'
            }));
        }
        return;
    }
    // Onboarding form submission
    if (url.pathname === '/onboarding' && req.method === 'POST') {
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        if (isRateLimited(String(clientIp))) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many requests. Please try again later.' }));
            return;
        }
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
                }
                else if (contentType.includes('application/x-www-form-urlencoded')) {
                    // Parse URL-encoded form data
                    const params = new URLSearchParams(body);
                    data = {
                        name: params.get('name'),
                        address: params.get('address'),
                        phone: params.get('phone'),
                        email: params.get('email')
                    };
                }
                else {
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
            }
            catch (error) {
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
    function readBody(req) {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', (chunk) => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                }
                catch (e) {
                    reject(e);
                }
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
        }
        catch (error) {
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
        }
        catch (error) {
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
        }
        catch (error) {
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
            }
            catch (stripeErr) {
                // If Stripe not configured, stub it
                console.warn('Stripe not available, stubbing checkout:', stripeErr.message);
                res.writeHead(200, CORS_HEADERS);
                res.end(JSON.stringify({ stub: true, message: 'Stripe not configured yet — skipping to next step' }));
            }
        }
        catch (error) {
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
                    await twilioClient.sendSms(restaurant.owner_phone, `Welcome to Maitreo! Your reviews are now being monitored 24/7. Reply HELP for commands.`);
                }
                catch (smsErr) {
                    console.error('Welcome SMS failed:', smsErr);
                }
            }
            // Mark onboarding complete
            try {
                await pool.query('UPDATE restaurants SET onboarding_complete = true WHERE id = $1', [restaurantId]);
            }
            catch (dbErr) {
                console.error('Failed to mark onboarding complete:', dbErr);
            }
            // Trigger initial review poll (non-blocking)
            reviewMonitor.runOnce().catch(console.error);
            res.writeHead(200, CORS_HEADERS);
            res.end(JSON.stringify({ success: true, message: 'Onboarding complete!' }));
        }
        catch (error) {
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
        await handleStripeWebhook(req, res);
        return;
    }
    // Create Checkout Session (start subscription)
    if (url.pathname === '/api/checkout' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
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
            }
            catch (err) {
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
    // Send mock review alert (for testing SMS command flow)
    if (url.pathname === '/sms/test/mock-alert' && req.method === 'POST') {
        if (process.env.NODE_ENV === 'production') {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Test endpoints disabled in production' }));
            return;
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
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
            }
            catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }
    // Job: review-monitor (GET or POST)
    if (url.pathname === '/jobs/review-monitor') {
        if (!validateJobAuth(req)) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized: invalid or missing API secret' }));
            return;
        }
        res.writeHead(202, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'accepted', message: 'Review monitor started' }));
        reviewMonitor.runOnce().catch(console.error);
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
        }
        catch (error) {
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
        }
        catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
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
        // Store return URL for post-callback redirect
        if (returnUrl) {
            global.__oauthReturnUrls = global.__oauthReturnUrls || new Map();
            global.__oauthReturnUrls.set(restaurantId, returnUrl);
        }
        try {
            const authUrl = generateAuthUrl(restaurantId);
            res.writeHead(302, { Location: authUrl });
            res.end();
        }
        catch (error) {
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
                // Check for onboarding return URL
                const returnUrls = global.__oauthReturnUrls;
                const rid = result.restaurantId;
                const returnUrl = rid && returnUrls?.get(rid);
                if (returnUrl) {
                    returnUrls.delete(rid);
                    res.writeHead(302, { Location: returnUrl });
                    res.end();
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<h1>✅ Google Connected!</h1><p>Your Google Business Profile is now linked to Maitreo.</p><p>You can close this window.</p>`);
            }
            else {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`<h1>❌ Connection Failed</h1><p>${result.error}</p><p>Please try again.</p>`);
            }
        }
        catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }
    // Fetch reviews for a connected restaurant
    if (url.pathname === '/api/reviews/fetch' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
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
            }
            catch (err) {
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
        }
        catch (err) {
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
        }
        catch { }
    }
    // Fallback: serve landing page for unmatched GET routes
    if (req.method === 'GET') {
        try {
            const landing = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'));
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(landing);
            return;
        }
        catch { }
    }
    // 404 for API routes
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
});
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
});
// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    server.close(async () => {
        await pool.end();
        process.exit(0);
    });
});
//# sourceMappingURL=index.js.map