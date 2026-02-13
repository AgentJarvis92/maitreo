# Maitreo State Machines

## 1. Review State (`reviews.pending_state`)

```
     ┌─────────┐
     │  NULL    │  (new review polled from Google)
     └────┬────┘
          │ AI generates draft reply
          ▼
  ┌───────────────┐
  │draft_generated │
  └───────┬───────┘
          │ SMS sent to owner with draft
          ▼
 ┌─────────────────┐
 │pending_approval  │
 └──┬──────┬──────┬┘
    │      │      │
 APPROVE  IGNORE  EDIT <custom text>
    │      │      │
    ▼      ▼      ▼
 ┌──────┐ ┌───────┐ ┌──────┐
 │posted│ │ignored│ │posted│
 └──────┘ └───────┘ └──────┘
```

| Transition | Trigger | Side Effects |
|---|---|---|
| NULL → draft_generated | Cron: AI reply generator | Creates `replies` row (status=draft) |
| draft_generated → pending_approval | Cron: SMS dispatcher | Sends SMS with draft text; updates `sms_context.last_pending_review_id` |
| pending_approval → posted | SMS: `APPROVE` | Posts reply via Google API; sets `replies.status=posted`, `reviews.replied=true` |
| pending_approval → posted | SMS: `EDIT <text>` | Sets `replies.final_text`, posts to Google; sets `replies.status=posted`, `reviews.replied=true` |
| pending_approval → ignored | SMS: `IGNORE` | No Google API call; clears `sms_context` |

### SMS Command Mapping

| Command | Action |
|---|---|
| `APPROVE` or `1` | Post draft as-is |
| `IGNORE` or `2` | Skip this review |
| `EDIT` | Enter custom reply mode (`sms_context.conversation_state = waiting_custom_reply`); next message becomes `replies.final_text` |

---

## 2. Subscription State (`subscriptions.state`)

```
     ┌──────┐
     │ NULL │  (no subscription)
     └──┬───┘
        │ Stripe Checkout completed
        ▼
  ┌──────────┐
  │ trialing │
  └────┬─────┘
       │ trial ends + payment succeeds
       ▼
   ┌────────┐◄──────────┐
   │ active │            │ retry succeeds
   └──┬──┬──┘            │
      │  │ payment fails │
      │  ▼               │
      │ ┌──────────┐─────┘
      │ │ past_due │
      │ └────┬─────┘
      │      │ non-payment (final)
      │      ▼
      │  ┌──────────┐
      └─►│ canceled │◄── user cancels
         └──────────┘
```

| Transition | Stripe Event | Side Effect |
|---|---|---|
| NULL → trialing | `checkout.session.completed` | Create subscription row; set `restaurants.subscription_state` via trigger |
| trialing → active | `customer.subscription.updated` (status=active) | Update state |
| active → past_due | `invoice.payment_failed` | Update state; send SMS warning |
| past_due → active | `invoice.payment_succeeded` | Update state |
| active → canceled | `customer.subscription.deleted` | Update state; set `monitoring_enabled=false` |
| past_due → canceled | `customer.subscription.deleted` | Update state; set `monitoring_enabled=false` |

---

## 3. Monitoring Gate

```sql
-- A restaurant is polled IFF:
monitoring_enabled = true
AND subscription_state IN ('trialing', 'active')
```

Convenience view: `active_monitored_restaurants`

Used by the review polling cron to determine which restaurants to check.

---

## 4. SMS Context State (`sms_context.conversation_state`)

```
  NULL (idle)
    │
    │ user sends EDIT
    ▼
  waiting_custom_reply
    │
    │ next inbound SMS → used as final_text
    ▼
  NULL (idle, review transitions to posted)
```

Reset to NULL after any terminal action (APPROVE, IGNORE, or custom reply received).
