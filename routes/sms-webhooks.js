/**
 * SMS Webhook Routes
 * Handles incoming SMS commands (APPROVE, EDIT, IGNORE, etc.)
 */

const express = require('express');
const router = express.Router();

// Twilio webhook for incoming SMS
router.post('/incoming', (req, res) => {
  const { From, Body } = req.body;
  
  console.log(`SMS received from ${From}: ${Body}`);
  
  // Phase 3 will implement command parsing here
  res.type('text/xml');
  res.send('<Response></Response>');
});

module.exports = router;
