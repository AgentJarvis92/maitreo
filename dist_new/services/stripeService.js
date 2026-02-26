/**
 * Stripe Service — Subscription lifecycle management for Maitreo.
 *
 * State machine:
 *   null → trialing  (signup via Checkout)
 *   trialing → active (trial converts / first invoice paid)
 *   active → past_due (invoice.payment_failed)
 *   past_due → active (invoice.payment_succeeded)
 *   active|past_due → canceled (subscription deleted / user cancels)
 */
import Stripe from 'stripe';
import dotenv from 'dotenv';
import { query } from '../db/client.js';
dotenv.config();
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_stub_key_not_configured';
if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️  STRIPE_SECRET_KEY not configured - Stripe operations will fail at runtime');
}
export const stripe = new Stripe(stripeKey);
// ─── Constants ───────────────────────────────────────────────────────
const PRODUCT_NAME = 'Maitreo — Google Review Management';
const PRICE_AMOUNT = 9900; // $99 in cents
const TRIAL_DAYS = 14;
// ─── Product / Price setup (idempotent) ──────────────────────────────
let _priceId = null;
/**
 * Ensure Stripe product + price exist, return the price ID.
 * Caches after first call.
 */
export async function ensurePriceId() {
    if (_priceId)
        return _priceId;
    // Search for existing product by name
    const products = await stripe.products.search({
        query: `name:"${PRODUCT_NAME}" AND active:"true"`,
    });
    let productId;
    if (products.data.length > 0) {
        productId = products.data[0].id;
    }
    else {
        const product = await stripe.products.create({
            name: PRODUCT_NAME,
            description: 'AI-powered Google review management with automated responses, competitive intelligence, and SMS alerts.',
        });
        productId = product.id;
        console.log(`✅ Created Stripe product: ${productId}`);
    }
    // Check for existing $99/mo price
    const prices = await stripe.prices.list({
        product: productId,
        active: true,
        type: 'recurring',
    });
    const existing = prices.data.find((p) => { var _a; return p.unit_amount === PRICE_AMOUNT && ((_a = p.recurring) === null || _a === void 0 ? void 0 : _a.interval) === 'month'; });
    if (existing) {
        _priceId = existing.id;
    }
    else {
        const price = await stripe.prices.create({
            product: productId,
            unit_amount: PRICE_AMOUNT,
            currency: 'usd',
            recurring: { interval: 'month' },
        });
        _priceId = price.id;
        console.log(`✅ Created Stripe price: ${_priceId}`);
    }
    return _priceId;
}
// ─── Checkout Session ────────────────────────────────────────────────
/**
 * Create a Checkout Session for a new subscription with 14-day trial.
 */
export async function createCheckoutSession(params) {
    const priceId = await ensurePriceId();
    const baseUrl = process.env.APP_BASE_URL || 'https://maitreo.com';
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        subscription_data: {
            trial_period_days: TRIAL_DAYS,
            metadata: { restaurant_id: params.restaurantId },
        },
        metadata: { restaurant_id: params.restaurantId },
        customer_email: params.customerEmail || undefined,
        success_url: params.successUrl || `${baseUrl}/welcome?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: params.cancelUrl || `${baseUrl}/pricing`,
    });
    return session;
}
// ─── Customer Portal ─────────────────────────────────────────────────
/**
 * Create a billing portal session (1-hour magic link).
 */
export async function createPortalSession(stripeCustomerId) {
    const baseUrl = process.env.APP_BASE_URL || 'https://maitreo.com';
    const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${baseUrl}/dashboard`,
    });
    return session.url;
}
// ─── Cancel Subscription ─────────────────────────────────────────────
/**
 * Immediately cancel a subscription.
 */
export async function cancelSubscription(subscriptionId) {
    return stripe.subscriptions.cancel(subscriptionId);
}
/**
 * Map Stripe subscription status to our state.
 */
function mapStripeStatus(status) {
    switch (status) {
        case 'trialing': return 'trialing';
        case 'active': return 'active';
        case 'past_due': return 'past_due';
        case 'canceled':
        case 'unpaid':
        case 'incomplete_expired':
            return 'canceled';
        default:
            return 'active';
    }
}
/**
 * Update restaurant subscription state from a Stripe subscription object.
 */
export async function syncSubscriptionState(sub) {
    var _a;
    const restaurantId = (_a = sub.metadata) === null || _a === void 0 ? void 0 : _a.restaurant_id;
    if (!restaurantId) {
        console.warn(`⚠️ Subscription ${sub.id} has no restaurant_id metadata`);
        return;
    }
    const state = mapStripeStatus(sub.status);
    const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
    // In Stripe SDK v20+, current_period_end may be on items or accessed via any
    const periodEndTs = sub.current_period_end;
    const periodEnd = periodEndTs ? new Date(periodEndTs * 1000) : null;
    const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
    await query(`UPDATE restaurants SET
       stripe_customer_id = $1,
       stripe_subscription_id = $2,
       subscription_state = $3,
       trial_ends_at = $4,
       current_period_end = $5,
       updated_at = NOW()
     WHERE id = $6`, [customerId, sub.id, state, trialEnd, periodEnd, restaurantId]);
    console.log(`📦 Restaurant ${restaurantId} → subscription_state=${state}`);
    // Handle monitoring pause/resume based on state
    if (state === 'canceled' || state === 'past_due') {
        await query(`UPDATE restaurants SET monitoring_paused = true WHERE id = $1`, [restaurantId]);
    }
    else if (state === 'active' || state === 'trialing') {
        await query(`UPDATE restaurants SET monitoring_paused = false WHERE id = $1`, [restaurantId]);
    }
}
/**
 * Find restaurant by Stripe customer ID.
 */
export async function findRestaurantByCustomerId(customerId) {
    const result = await query(`SELECT id, owner_phone FROM restaurants WHERE stripe_customer_id = $1 LIMIT 1`, [customerId]);
    return result.rows[0] || null;
}
/**
 * Find restaurant by Stripe subscription ID.
 */
export async function findRestaurantBySubscriptionId(subscriptionId) {
    const result = await query(`SELECT id, owner_phone, subscription_state FROM restaurants WHERE stripe_subscription_id = $1 LIMIT 1`, [subscriptionId]);
    return result.rows[0] || null;
}
export default {
    stripe,
    ensurePriceId,
    createCheckoutSession,
    createPortalSession,
    cancelSubscription,
    syncSubscriptionState,
    findRestaurantByCustomerId,
    findRestaurantBySubscriptionId,
};
//# sourceMappingURL=stripeService.js.map