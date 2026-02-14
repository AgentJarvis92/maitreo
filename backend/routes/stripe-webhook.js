/**
 * Stripe Webhook Routes
 * - POST /api/stripe/webhook - Handle payment success/failure
 */

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * POST /api/stripe/webhook
 * Handle Stripe payment events
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        webhookSecret
      );
    } catch (error) {
      console.error('Webhook signature verification failed:', error.message);
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    console.log(`Processing Stripe event: ${event.type}`);

    // Handle payment_intent.succeeded
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;
      await handlePaymentSuccess(paymentIntent);
    }

    // Handle payment_intent.payment_failed
    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object;
      await handlePaymentFailure(paymentIntent);
    }

    // Send response to Stripe
    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Handle successful payment
 * Create customer record and redirect to onboarding form
 */
async function handlePaymentSuccess(paymentIntent) {
  try {
    // Extract metadata from payment intent
    const { metadata, client_email, amount } = paymentIntent;
    const sessionId = metadata?.sessionId || paymentIntent.id;

    console.log(`Payment successful for session: ${sessionId}`);

    // Check if customer already exists
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('session_id', sessionId)
      .single();

    if (existing) {
      console.log(`Customer already exists for session ${sessionId}`);
      
      // Update payment status
      await supabase
        .from('customers')
        .update({
          payment_status: 'completed',
          payment_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      
      return;
    }

    // Create new customer record
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({
        session_id: sessionId,
        stripe_customer_id: paymentIntent.customer,
        email: client_email || paymentIntent.receipt_email,
        payment_status: 'completed',
        payment_amount: amount,
        payment_date: new Date().toISOString(),
        onboarding_status: 'not_started'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating customer record:', error);
      return;
    }

    console.log(`Created customer record: ${customer.id} for session ${sessionId}`);

    // Send confirmation email (optional - implement as needed)
    // await sendPaymentConfirmationEmail(customer);

  } catch (error) {
    console.error('Error handling payment success:', error);
  }
}

/**
 * Handle payment failure
 */
async function handlePaymentFailure(paymentIntent) {
  try {
    const { metadata, id } = paymentIntent;
    const sessionId = metadata?.sessionId || id;

    console.log(`Payment failed for session: ${sessionId}`);

    // Check if customer exists
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('session_id', sessionId)
      .single();

    if (existing) {
      // Update payment status
      await supabase
        .from('customers')
        .update({
          payment_status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
    } else {
      // Create failed payment record
      await supabase
        .from('customers')
        .insert({
          session_id: sessionId,
          stripe_customer_id: paymentIntent.customer,
          payment_status: 'failed',
          onboarding_status: 'not_started'
        });
    }
  } catch (error) {
    console.error('Error handling payment failure:', error);
  }
}

module.exports = router;
