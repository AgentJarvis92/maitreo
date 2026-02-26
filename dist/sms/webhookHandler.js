/**
 * Twilio SMS Webhook Handler
 * Receives incoming SMS via Twilio webhook POST and processes commands.
 * Also handles delivery status callbacks.
 */
import { smsService } from './smsService.js';
import { query } from '../db/client.js';
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
 * Handle POST /webhooks/twilio/inbound — Twilio incoming SMS webhook
 */
export async function handleSmsWebhook(req, res) {
    try {
        const params = await parseFormBody(req);
        const from = params.From || '';
        const body = params.Body || '';
        const messageSid = params.MessageSid || '';
        console.log(`📨 Incoming SMS from ${from}: "${body.slice(0, 80)}${body.length > 80 ? '...' : ''}"`);
        if (!from || !body) {
            twimlResponse(res, 'Invalid message received.');
            return;
        }
        const reply = await smsService.handleIncoming(from, body, messageSid);
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
export async function handleStatusCallback(req, res) {
    try {
        const params = await parseFormBody(req);
        const messageSid = params.MessageSid || '';
        const messageStatus = params.MessageStatus || ''; // queued, sent, delivered, undelivered, failed
        if (messageSid && messageStatus) {
            // Update sms_logs
            await query(`UPDATE sms_logs SET status = $1 WHERE twilio_sid = $2`, [messageStatus, messageSid]).catch(err => console.error('Failed to update SMS status:', err));
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
//# sourceMappingURL=webhookHandler.js.map