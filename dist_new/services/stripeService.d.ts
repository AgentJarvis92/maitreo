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
export declare const stripe: any;
/**
 * Ensure Stripe product + price exist, return the price ID.
 * Caches after first call.
 */
export declare function ensurePriceId(): Promise<string>;
/**
 * Create a Checkout Session for a new subscription with 14-day trial.
 */
export declare function createCheckoutSession(params: {
    restaurantId: string;
    customerEmail?: string;
    successUrl?: string;
    cancelUrl?: string;
}): Promise<Stripe.Checkout.Session>;
/**
 * Create a billing portal session (1-hour magic link).
 */
export declare function createPortalSession(stripeCustomerId: string): Promise<string>;
/**
 * Immediately cancel a subscription.
 */
export declare function cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription>;
/**
 * Update restaurant subscription state from a Stripe subscription object.
 */
export declare function syncSubscriptionState(sub: Stripe.Subscription): Promise<void>;
/**
 * Find restaurant by Stripe customer ID.
 */
export declare function findRestaurantByCustomerId(customerId: string): Promise<{
    id: string;
    owner_phone: string | null;
} | null>;
/**
 * Find restaurant by Stripe subscription ID.
 */
export declare function findRestaurantBySubscriptionId(subscriptionId: string): Promise<{
    id: string;
    owner_phone: string | null;
    subscription_state: string | null;
} | null>;
declare const _default: {
    stripe: any;
    ensurePriceId: typeof ensurePriceId;
    createCheckoutSession: typeof createCheckoutSession;
    createPortalSession: typeof createPortalSession;
    cancelSubscription: typeof cancelSubscription;
    syncSubscriptionState: typeof syncSubscriptionState;
    findRestaurantByCustomerId: typeof findRestaurantByCustomerId;
    findRestaurantBySubscriptionId: typeof findRestaurantBySubscriptionId;
};
export default _default;
