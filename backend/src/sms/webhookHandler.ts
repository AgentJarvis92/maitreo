/**
 * Twilio SMS Webhook Handler
 * Receives incoming SMS via Twilio webhook POST and processes commands.
 * Also handles delivery status callbacks.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { smsService } from './smsService.js';
import { query } from '../db/client.js';

/**
 * Parse URL-encoded form body (Twilio sends application/x-www-form-urlencoded)
 */
function parseFormBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
    req.on('end', () => {
      const params: Record<string, string> = {};
      for (const pair of body.split('&')) {
        const [key, val] = pair.split('=');
        if (key) params[decodeURIComponent(key)] = decodeURIComponent(val || '');
      }
      resolve(params);
    });
    req.on('error', reject);
  });
}

/**
 * Respond with TwiML — sends an SMS reply.
 */
function twimlResponse(res: ServerResponse, message: string): void {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(xml);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Handle POST /webhooks/twilio/inbound — Twilio incoming SMS webhook
 */
export async function handleSmsWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
  } catch (error) {
    console.error('❌ SMS webhook error:', error);
    twimlResponse(res, 'Something went wrong. Please try again.');
  }
}

/**
 * Handle POST /webhooks/twilio/status — Twilio delivery status callback
 */
export async function handleStatusCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const params = await parseFormBody(req);
    const messageSid = params.MessageSid || '';
    const messageStatus = params.MessageStatus || ''; // queued, sent, delivered, undelivered, failed

    if (messageSid && messageStatus) {
      // Update sms_logs
      await query(
        `UPDATE sms_logs SET status = $1 WHERE twilio_sid = $2`,
        [messageStatus, messageSid]
      ).catch(err => console.error('Failed to update SMS status:', err));

      console.log(`📱 SMS ${messageSid} status: ${messageStatus}`);
    }

    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end('<Response></Response>');
  } catch (error) {
    console.error('❌ Status callback error:', error);
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end('<Response></Response>');
  }
}
