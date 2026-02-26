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
import { stripe, syncSubscriptionState, findRestaurantBySubscriptionId, } from '../services/stripeService.js';
import { query } from '../db/client.js';
import { smsService } from '../sms/smsService.js';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
/**
 * Read raw body from request (needed for Stripe signature verification).
 */
function getRawBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}
/**
 * Handle POST /webhooks/stripe
 */
export async function handleStripeWebhook(req, res) {
    const rawBody = await getRawBody(req);
    let event;
    if (WEBHOOK_SECRET) {
        const sig = req.headers['stripe-signature'];
        try {
            event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
        }
        catch (err) {
            console.error('⚠️ Stripe webhook signature verification failed:', err.message);
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid signature' }));
            return;
        }
    }
    else {
        // No secret configured — parse directly (dev mode)
        event = JSON.parse(rawBody.toString());
        console.warn('⚠️ STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
    }
    console.log(`🔔 Stripe event: ${event.type} (${event.id})`);
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object);
                break;
            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;
            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object);
                break;
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;
            default:
                console.log(`  ↳ Unhandled event type: ${event.type}`);
        }
    }
    catch (err) {
        console.error(`❌ Error processing ${event.type}:`, err);
        // Still return 200 so Stripe doesn't retry indefinitely
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true }));
}
// ─── Event Handlers ──────────────────────────────────────────────────
async function handleCheckoutCompleted(session) {
    const restaurantId = session.metadata?.restaurant_id;
    if (!restaurantId) {
        console.warn('⚠️ checkout.session.completed missing restaurant_id');
        return;
    }
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
    if (customerId) {
        await query(`UPDATE restaurants SET stripe_customer_id = $1 WHERE id = $2`, [customerId, restaurantId]);
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
async function handleSubscriptionCreated(sub) {
    await syncSubscriptionState(sub);
}
async function handleSubscriptionUpdated(sub) {
    await syncSubscriptionState(sub);
}
async function handleSubscriptionDeleted(sub) {
    const restaurantId = sub.metadata?.restaurant_id;
    if (!restaurantId)
        return;
    await query(`UPDATE restaurants SET
       subscription_state = 'canceled',
       monitoring_paused = true,
       updated_at = NOW()
     WHERE id = $1`, [restaurantId]);
    console.log(`🚫 Subscription canceled for restaurant ${restaurantId}`);
}
async function handlePaymentSucceeded(invoice) {
    const sub = invoice.subscription;
    const subscriptionId = typeof sub === 'string' ? sub : sub?.id;
    if (!subscriptionId)
        return;
    const restaurant = await findRestaurantBySubscriptionId(subscriptionId);
    if (!restaurant)
        return;
    // If was past_due, resume monitoring
    if (restaurant.subscription_state === 'past_due') {
        await query(`UPDATE restaurants SET
         subscription_state = 'active',
         monitoring_paused = false,
         updated_at = NOW()
       WHERE id = $1`, [restaurant.id]);
        console.log(`✅ Payment succeeded — restaurant ${restaurant.id} resumed`);
    }
}
async function handlePaymentFailed(invoice) {
    const sub = invoice.subscription;
    const subscriptionId = typeof sub === 'string' ? sub : sub?.id;
    if (!subscriptionId)
        return;
    const restaurant = await findRestaurantBySubscriptionId(subscriptionId);
    if (!restaurant)
        return;
    await query(`UPDATE restaurants SET
       subscription_state = 'past_due',
       monitoring_paused = true,
       updated_at = NOW()
     WHERE id = $1`, [restaurant.id]);
    console.log(`⚠️ Payment failed — restaurant ${restaurant.id} set to past_due`);
    // Send SMS notification
    if (restaurant.owner_phone) {
        try {
            await smsService.sendSms(restaurant.owner_phone, `⚠️ Your Maitreo payment failed. Review monitoring is paused. Please update your payment method: text BILLING to get a link.\nReply HELP anytime.`);
        }
        catch (err) {
            console.error('Failed to send payment failure SMS:', err);
        }
    }
}
