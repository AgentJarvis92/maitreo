/**
 * Maitreo Backend Server
 * - Stripe webhook handling (payment → onboarding flow)
 * - Onboarding form submission
 * - Google OAuth integration
 * - Review fetching and storage
 * - SMS notifications
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { startPollingService } = require('./services/review-poller');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware setup
// IMPORTANT: Raw body for Stripe webhook MUST be before express.json()
app.use('/api/stripe', require('express').raw({ type: 'application/json' }));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'maitreo-backend',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// API Routes
console.log('Setting up routes...');

// Stripe webhook (must be first, before json parsing)
app.use('/api/stripe', require('./routes/stripe-webhook'));

// Onboarding form
app.use('/api/onboarding', require('./routes/onboarding'));

// Google OAuth
app.use('/api/google', require('./routes/google-oauth'));

// Reviews (fetching and listing)
app.use('/api/reviews', require('./routes/reviews'));

// SMS webhooks (placeholder)
app.use('/api/sms', require('./routes/sms-webhooks'));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n✅ Maitreo Backend Server`);
  console.log(`📡 API: http://localhost:${PORT}`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n📚 Available Endpoints:`);
  console.log(`   POST   /api/stripe/webhook        - Stripe payment webhook`);
  console.log(`   GET    /api/onboarding/form/:id   - Get onboarding form`);
  console.log(`   POST   /api/onboarding/form       - Submit onboarding form`);
  console.log(`   GET    /api/google/auth           - Start Google OAuth`);
  console.log(`   GET    /api/google/callback       - OAuth callback handler`);
  console.log(`   GET    /api/reviews/fetch/:id     - Manually fetch reviews`);
  console.log(`   GET    /api/reviews/list/:id      - List reviews\n`);
  
  // Start review polling service
  try {
    startPollingService();
  } catch (error) {
    console.warn('⚠️  Review polling service failed to start:', error.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});

module.exports = app;
