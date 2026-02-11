# External Integrations

## Twilio SMS
- Purpose: Approval flow for negative reviews
- Account: agentjarvis@icloud.com
- Phone Number: +18553405068 (toll-free)
- Webhook: /api/webhooks/twilio
- Cost: ~$0.0079/msg outbound, $0.0075/msg inbound
- Plan: Trial ($15.50 credit)
- Note: Toll-free verification required for production

## Stripe Payments
- Product: ReviewReply Subscription (prod_TxgiZluQbyzt2S)
- Price: $99/month (price_1SzlLMH3UyR5N630R4th8KZd)
- Payment Link: https://buy.stripe.com/test_3cI3cv3YV0u64WScCr87K02
- Webhook: /api/webhooks/stripe
- Events: customer.subscription.created, updated, deleted
- Mode: Test (sandbox) — switch to live for production

## Testing
- Twilio: Trial account, verified numbers only
- Stripe: Test mode (pk_test_..., sk_test_...)
- Test card: 4242 4242 4242 4242 (any future date, any CVC)
