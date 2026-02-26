/**
 * Stripe Webhook Handler
 *
 * Events handled:
 *   customer.subscription.created  → set state=trialing, start monitoring
 *   customer.subscription.updated  → sync state
 *   customer.subscription.deleted  → set state=canceled, stop monitoring
 *   invoice.payment_succeeded      → if past_due, resume monitoring
 *   invoice.payment_failed         → set state=past_due, pause, send SMS
 *   checkout.session.completed     → link customer to restaurant
 */
import type { IncomingMessage, ServerResponse } from 'http';
/**
 * Handle POST /webhooks/stripe
 */
export declare function handleStripeWebhook(req: IncomingMessage, res: ServerResponse): Promise<void>;
