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
import Stripe from 'stripe';
import {
  stripe,
  syncSubscriptionState,
  findRestaurantByCustomerId,
  findRestaurantBySubscriptionId,
} from '../services/stripeService.js';
import { query } from '../db/client.js';
import { smsService } from '../sms/smsService.js';
import { emailService } from '../services/emailService.js';

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

/**
 * Read raw body from request (needed for Stripe signature verification).
 */
function getRawBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Handle POST /webhooks/stripe
 */
export async function handleStripeWebhook(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rawBody = await getRawBody(req);

  let event: Stripe.Event;

  if (WEBHOOK_SECRET) {
    const sig = req.headers['stripe-signature'] as string;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err: any) {
      console.error('⚠️ Stripe webhook signature verification failed:', err.message);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid signature' }));
      return;
    }
  } else {
    // No secret configured — parse directly (dev mode)
    event = JSON.parse(rawBody.toString()) as Stripe.Event;
    console.warn('⚠️ STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
  }

  console.log(`🔔 Stripe event: ${event.type} (${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`  ↳ Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`❌ Error processing ${event.type}:`, err);
    // Still return 200 so Stripe doesn't retry indefinitely
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ received: true }));
}

// ─── Event Handlers ──────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const restaurantId = session.metadata?.restaurant_id;
  if (!restaurantId) {
    console.warn('⚠️ checkout.session.completed missing restaurant_id');
    return;
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  if (customerId) {
    await query(
      `UPDATE restaurants SET stripe_customer_id = $1 WHERE id = $2`,
      [customerId, restaurantId]
    );
  }

  if (subscriptionId) {
    // Fetch full subscription to sync state
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    // Ensure metadata has restaurant_id
    if (!sub.metadata?.restaurant_id) {
      await stripe.subscriptions.update(subscriptionId, {
        metadata: { restaurant_id: restaurantId },
      });
      sub.metadata.restaurant_id = restaurantId;
    }
    await syncSubscriptionState(sub);
  }

  console.log(`🎉 Checkout completed: restaurant=${restaurantId} customer=${customerId}`);
}

async function handleSubscriptionCreated(sub: Stripe.Subscription): Promise<void> {
  await syncSubscriptionState(sub);

  // Send activation email now that subscription is live
  const restaurantId = sub.metadata?.restaurant_id;
  if (!restaurantId) return;

  try {
    const result = await query<{ name: string; owner_email: string; stripe_customer_id: string }>(
      `SELECT name, owner_email, stripe_customer_id FROM restaurants WHERE id = $1`,
      [restaurantId]
    );
    const restaurant = result.rows[0];
    if (!restaurant?.owner_email) return;

    // Generate Stripe billing portal URL
    const customerId = restaurant.stripe_customer_id ||
      (typeof sub.customer === 'string' ? sub.customer : sub.customer?.id);
    let manageSubscriptionUrl = 'https://maitreo.com';
    if (customerId) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: 'https://maitreo.com',
      });
      manageSubscriptionUrl = portal.url;
    }

    await emailService.sendActivationEmail(
      restaurant.owner_email,
      restaurant.name,
      manageSubscriptionUrl
    );
    console.log(`✅ Activation email sent to ${restaurant.owner_email}`);
  } catch (err: any) {
    // Non-fatal — don't let email failure block webhook response
    console.error('❌ Failed to send activation email:', err.message);
  }
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription): Promise<void> {
  await syncSubscriptionState(sub);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription): Promise<void> {
  const restaurantId = sub.metadata?.restaurant_id;
  if (!restaurantId) return;

  await query(
    `UPDATE restaurants SET
       subscription_state = 'canceled',
       monitoring_paused = true,
       updated_at = NOW()
     WHERE id = $1`,
    [restaurantId]
  );

  console.log(`🚫 Subscription canceled for restaurant ${restaurantId}`);
}

async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
  const sub = (invoice as any).subscription;
  const subscriptionId = typeof sub === 'string' ? sub : sub?.id;

  if (!subscriptionId) return;

  const restaurant = await findRestaurantBySubscriptionId(subscriptionId);
  if (!restaurant) return;

  // If was past_due, resume monitoring
  if (restaurant.subscription_state === 'past_due') {
    await query(
      `UPDATE restaurants SET
         subscription_state = 'active',
         monitoring_paused = false,
         updated_at = NOW()
       WHERE id = $1`,
      [restaurant.id]
    );
    console.log(`✅ Payment succeeded — restaurant ${restaurant.id} resumed`);
  }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const sub = (invoice as any).subscription;
  const subscriptionId = typeof sub === 'string' ? sub : sub?.id;

  if (!subscriptionId) return;

  const restaurant = await findRestaurantBySubscriptionId(subscriptionId);
  if (!restaurant) return;

  await query(
    `UPDATE restaurants SET
       subscription_state = 'past_due',
       monitoring_paused = true,
       updated_at = NOW()
     WHERE id = $1`,
    [restaurant.id]
  );

  console.log(`⚠️ Payment failed — restaurant ${restaurant.id} set to past_due`);

  // Send SMS notification
  if (restaurant.owner_phone) {
    try {
      await smsService.sendSms(
        restaurant.owner_phone,
        `⚠️ Your Maitreo payment failed. Review monitoring is paused. Please update your payment method: text BILLING to get a link.\nReply HELP anytime.`
      );
    } catch (err) {
      console.error('Failed to send payment failure SMS:', err);
    }
  }
}
