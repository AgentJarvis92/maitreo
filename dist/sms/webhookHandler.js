"use strict";
/**
 * Twilio SMS Webhook Handler
 * Receives incoming SMS via Twilio webhook POST and processes commands.
 * Also handles delivery status callbacks.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSmsWebhook = handleSmsWebhook;
exports.handleStatusCallback = handleStatusCallback;
const crypto_1 = __importDefault(require("crypto"));
const smsService_js_1 = require("./smsService.js");
const client_js_1 = require("../db/client.js");
/**
 * Parse URL-encoded form body (Twilio sends application/x-www-form-urlencoded)
 */
function parseFormBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => { body += chunk.toString(); });
        req.on('end', () => {
            const params = {};
            for (const pair of body.split('&')) {
                const [key, val] = pair.split('=');
                if (key)
                    params[decodeURIComponent(key)] = decodeURIComponent(val || '');
            }
            resolve(params);
        });
        req.on('error', reject);
    });
}
/**
 * Respond with TwiML — sends an SMS reply.
 */
function twimlResponse(res, message) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(xml);
}
function escapeXml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/**
 * Validate Twilio request signature (X-Twilio-Signature).
 * See: https://www.twilio.com/docs/usage/security#validating-requests
 */
function validateTwilioSignature(req, params) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
        // If no auth token configured, skip validation (dev mode)
        if (process.env.NODE_ENV === 'production') {
            console.error('❌ TWILIO_AUTH_TOKEN not set in production — rejecting request');
            return false;
        }
        return true;
    }
    const signature = req.headers['x-twilio-signature'];
    if (!signature)
        return false;
    // Build the data string: URL + sorted params concatenated
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || '';
    const url = `${protocol}://${host}${req.url}`;
    const sortedKeys = Object.keys(params).sort();
    let dataString = url;
    for (const key of sortedKeys) {
        dataString += key + params[key];
    }
    const expectedSignature = crypto_1.default
        .createHmac('sha1', authToken)
        .update(dataString)
        .digest('base64');
    return crypto_1.default.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}
/**
 * Handle POST /webhooks/twilio/inbound — Twilio incoming SMS webhook
 */
async function handleSmsWebhook(req, res) {
    try {
        const params = await parseFormBody(req);
        // Validate Twilio signature in production
        if (process.env.NODE_ENV === 'production' && !validateTwilioSignature(req, params)) {
            console.error('❌ Invalid Twilio signature — rejecting webhook request');
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden: invalid signature');
            return;
        }
        const from = params.From || '';
        const body = params.Body || '';
        const messageSid = params.MessageSid || '';
        console.log(`📨 Incoming SMS from ${from}: "${body.slice(0, 80)}${body.length > 80 ? '...' : ''}"`);
        if (!from || !body) {
            twimlResponse(res, 'Invalid message received.');
            return;
        }
        // Idempotence check: reject duplicate MessageSid
        if (messageSid) {
            const existing = await (0, client_js_1.query)(`SELECT id FROM sms_logs WHERE twilio_sid = $1 AND direction = 'inbound' LIMIT 1`, [messageSid]);
            if (existing.rows.length > 0) {
                console.log(`⚠️ Duplicate MessageSid ${messageSid} — skipping`);
                res.writeHead(200, { 'Content-Type': 'text/xml' });
                res.end('<Response></Response>');
                return;
            }
        }
        const reply = await smsService_js_1.smsService.handleIncoming(from, body, messageSid);
        twimlResponse(res, reply);
    }
    catch (error) {
        console.error('❌ SMS webhook error:', error);
        twimlResponse(res, 'Something went wrong. Please try again.');
    }
}
/**
 * Handle POST /webhooks/twilio/status — Twilio delivery status callback
 */
async function handleStatusCallback(req, res) {
    try {
        const params = await parseFormBody(req);
        const messageSid = params.MessageSid || '';
        const messageStatus = params.MessageStatus || ''; // queued, sent, delivered, undelivered, failed
        if (messageSid && messageStatus) {
            // Update sms_logs
            await (0, client_js_1.query)(`UPDATE sms_logs SET status = $1 WHERE twilio_sid = $2`, [messageStatus, messageSid]).catch(err => console.error('Failed to update SMS status:', err));
            console.log(`📱 SMS ${messageSid} status: ${messageStatus}`);
        }
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end('<Response></Response>');
    }
    catch (error) {
        console.error('❌ Status callback error:', error);
        res.writeHead(200, { 'Content-Type': 'text/xml' });
        res.end('<Response></Response>');
    }
}
