/**
 * Onboarding Routes
 * - POST /api/onboarding/form - Submit onboarding form
 * - GET /api/onboarding/form/:sessionId - Get onboarding form (pre-fill if exists)
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * GET /api/onboarding/form/:sessionId
 * Retrieve onboarding form with pre-filled data if it exists
 */
router.get('/form/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Find customer by session ID
    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Return customer data (for form pre-fill)
    res.json({
      sessionId,
      customer: {
        restaurantName: customer.restaurant_name,
        location: customer.location,
        phone: customer.phone,
        email: customer.email
      },
      onboardingStatus: customer.onboarding_status,
      googleConnected: customer.google_connected
    });
  } catch (error) {
    console.error('Error retrieving onboarding form:', error);
    res.status(500).json({ error: 'Failed to retrieve form' });
  }
});

/**
 * POST /api/onboarding/form
 * Submit onboarding form data
 */
router.post('/form', async (req, res) => {
  try {
    const {
      sessionId,
      restaurantName,
      location,
      phone,
      email
    } = req.body;

    // Validate required fields
    if (!sessionId || !restaurantName || !email) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, restaurantName, email'
      });
    }

    // Find customer by session ID
    const { data: existingCustomer, error: findError } = await supabase
      .from('customers')
      .select('id')
      .eq('session_id', sessionId)
      .single();

    if (findError) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Update customer with onboarding data
    const { data: updated, error: updateError } = await supabase
      .from('customers')
      .update({
        restaurant_name: restaurantName,
        location: location,
        phone: phone,
        email: email,
        onboarding_status: 'in_progress',
        updated_at: new Date().toISOString()
      })
      .eq('id', existingCustomer.id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating customer:', updateError);
      return res.status(500).json({ error: 'Failed to save form data' });
    }

    // Return success with redirect to Google OAuth
    res.json({
      success: true,
      customerId: updated.id,
      sessionId: updated.session_id,
      message: 'Onboarding form submitted. Proceeding to Google Business connection...',
      nextStep: `/api/google/auth?sessionId=${updated.session_id}`
    });
  } catch (error) {
    console.error('Error submitting onboarding form:', error);
    res.status(500).json({ error: 'Failed to submit form' });
  }
});

module.exports = router;
