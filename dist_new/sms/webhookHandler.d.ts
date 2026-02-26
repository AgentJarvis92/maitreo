/**
 * Twilio SMS Webhook Handler
 * Receives incoming SMS via Twilio webhook POST and processes commands.
 * Also handles delivery status callbacks.
 */
import type { IncomingMessage, ServerResponse } from 'http';
/**
 * Handle POST /webhooks/twilio/inbound — Twilio incoming SMS webhook
 */
export declare function handleSmsWebhook(req: IncomingMessage, res: ServerResponse): Promise<void>;
/**
 * Handle POST /webhooks/twilio/status — Twilio delivery status callback
 */
export declare function handleStatusCallback(req: IncomingMessage, res: ServerResponse): Promise<void>;
