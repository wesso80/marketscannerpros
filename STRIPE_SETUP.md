# Simple Stripe Payment Setup

## Overview
This system has been simplified to just **2 tiers**:
- **FREE**: Basic scanner + Advanced charts
- **PAID ($4.99/month)**: Everything included

## Quick Setup

### 1. Create Stripe Product

1. Go to https://dashboard.stripe.com/products
2. Click **"+ Add Product"**
3. Fill in:
   - **Name**: Market Scanner Pro
   - **Price**: $4.99
   - **Billing**: Recurring monthly
4. Click **Save**
5. **Copy the Price ID** (starts with `price_...`)

### 2. Set Environment Variables

In Vercel or your `.env.local`:

```bash
# Enable payments
NEXT_PUBLIC_ENABLE_PAYMENTS=true

# Stripe keys
STRIPE_SECRET_KEY=sk_test_... # From Stripe Dashboard > API Keys
STRIPE_PRICE_PAID=price_... # Price ID from step 1

# Webhook secret (see step 3)
STRIPE_WEBHOOK_SECRET=whsec_...

# App URL
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### 3. Set Up Webhook

1. Go to https://dashboard.stripe.com/webhooks
2. Click **"+ Add endpoint"**
3. Enter URL: `https://your-domain.com/api/webhooks/stripe`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click **Add endpoint**
6. **Copy the Signing Secret** (`whsec_...`)
7. Add it to environment variables as `STRIPE_WEBHOOK_SECRET`

### 4. Deploy

```bash
vercel --prod
```

## Testing

1. Go to `/pricing` page
2. Click "Upgrade to Pro"
3. Use test card: `4242 4242 4242 4242`
4. Complete checkout
5. You should be redirected to the app with paid access

## Production Checklist

- [ ] Replace `STRIPE_SECRET_KEY` with live key (starts with `sk_live_`)
- [ ] Create product in Stripe LIVE mode
- [ ] Update webhook with production URL
- [ ] Test full payment flow
- [ ] Set `NEXT_PUBLIC_ENABLE_PAYMENTS=true`

## Troubleshooting

**Checkout not working?**
- Check Stripe keys are correct
- Verify Price ID exists
- Check browser console for errors

**Webhook not receiving events?**
- Verify webhook URL is correct
- Check webhook secret matches
- View webhook logs in Stripe Dashboard

**Payment successful but tier not updating?**
- Check webhook is configured correctly
- View webhook logs for errors
- Check database for subscription entry
