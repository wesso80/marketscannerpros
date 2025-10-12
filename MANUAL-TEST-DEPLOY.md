# Manual Test Deployment Guide

If the automated script fails, follow these manual steps:

## Option 1: Using Vercel CLI (Recommended)

### Step 1: Get Stripe Credentials
1. Go to https://dashboard.stripe.com/test/products
   - Create "Pro" product → $4.99/month → Copy `price_xxx` ID
   - Create "Pro Trader" product → $9.99/month → Copy `price_xxx` ID
2. Go to https://dashboard.stripe.com/test/apikeys
   - Copy Secret Key (`sk_test_xxx`)

### Step 2: Link New Vercel Project
```bash
vercel link
```
When prompted:
- Link to existing project? **NO**
- Project name: **marketscannerpros-test**
- Directory: **./** (press Enter)

### Step 3: Add Environment Variables
```bash
# Copy these commands and replace with your actual values

# Payment flags
echo "true" | vercel env add ENABLE_PAYMENTS production
echo "true" | vercel env add NEXT_PUBLIC_ENABLE_PAYMENTS production

# Stripe (test mode)
echo "sk_test_YOUR_KEY" | vercel env add STRIPE_SECRET_KEY production
echo "price_YOUR_PRO_ID" | vercel env add STRIPE_PRICE_PRO production
echo "price_YOUR_PRO_TRADER_ID" | vercel env add STRIPE_PRICE_PRO_TRADER production

# App secrets (from Replit)
echo "YOUR_SIGNING_SECRET" | vercel env add APP_SIGNING_SECRET production
echo "YOUR_DATABASE_URL" | vercel env add DATABASE_URL production

# Temporary webhook (will update later)
echo "whsec_temp" | vercel env add STRIPE_WEBHOOK_SECRET production
```

### Step 4: Deploy
```bash
vercel --prod
```

### Step 5: Configure Stripe Webhook
1. Copy your deployment URL (e.g., `marketscannerpros-test.vercel.app`)
2. Go to https://dashboard.stripe.com/test/webhooks/create
3. Endpoint URL: `https://YOUR-URL/api/payments/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Click "Add endpoint"
6. Copy the signing secret (`whsec_xxx`)

### Step 6: Update Webhook Secret
```bash
# Remove old webhook secret
vercel env rm STRIPE_WEBHOOK_SECRET production -y

# Add new webhook secret
echo "whsec_YOUR_ACTUAL_SECRET" | vercel env add STRIPE_WEBHOOK_SECRET production

# Redeploy
vercel --prod
```

---

## Option 2: Using Vercel Dashboard (Easiest)

### Step 1: Create New Project
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Project name: `marketscannerpros-test`
4. Click "Deploy" (will fail - that's OK)

### Step 2: Add Environment Variables
1. Go to Project Settings → Environment Variables
2. Add these variables for **Production**:

| Name | Value |
|------|-------|
| `ENABLE_PAYMENTS` | `true` |
| `NEXT_PUBLIC_ENABLE_PAYMENTS` | `true` |
| `STRIPE_SECRET_KEY` | `sk_test_YOUR_KEY` |
| `STRIPE_PRICE_PRO` | `price_YOUR_ID` |
| `STRIPE_PRICE_PRO_TRADER` | `price_YOUR_ID` |
| `APP_SIGNING_SECRET` | `YOUR_SECRET` |
| `DATABASE_URL` | `postgresql://...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_temp` |

3. Click "Deployments" → "Redeploy"

### Step 3: Configure Stripe Webhook
1. Copy deployment URL
2. Follow Step 5 from Option 1 above
3. Update `STRIPE_WEBHOOK_SECRET` in Vercel dashboard
4. Redeploy again

---

## Testing Your Deployment

### Test Payment Flow
1. Visit: `https://YOUR-TEST-URL/pricing`
2. Should see **paid plans** (not "Free for Everyone")
3. Click "Upgrade to Pro Trader"
4. Should redirect to Stripe checkout
5. Use test card: `4242 4242 4242 4242`
6. Complete payment
7. Should redirect to success page

### Verify Subscription
1. Check Stripe Dashboard:
   - https://dashboard.stripe.com/test/subscriptions
   - Should see active subscription
2. Check Database:
   ```sql
   SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 5;
   ```
3. Check Webhook Events:
   - https://dashboard.stripe.com/test/webhooks
   - Should see `checkout.session.completed` event

### Test Customer Portal
1. Visit: `https://YOUR-TEST-URL/account`
2. Click "Manage Billing"
3. Should open Stripe customer portal
4. Verify can cancel subscription

---

## Troubleshooting

### Build Error: "APP_SIGNING_SECRET required"
**Solution**: Environment variables not set for build phase
- Add all env vars using Vercel dashboard (Production environment)
- Or use `vercel env add` command BEFORE deploying

### Checkout Fails: "Payments not enabled"
**Solution**: `ENABLE_PAYMENTS` not set to `true`
- Check environment variables in Vercel dashboard
- Ensure `ENABLE_PAYMENTS=true` (server) and `NEXT_PUBLIC_ENABLE_PAYMENTS=true` (client)

### Webhook Not Working
**Solution**: Webhook secret mismatch or URL wrong
- Verify webhook URL matches deployment URL
- Copy signing secret from Stripe webhook settings
- Update `STRIPE_WEBHOOK_SECRET` and redeploy

### Tier Not Updating After Payment
**Solution**: Webhook not firing or database not updating
- Check Stripe webhook logs for delivery status
- Verify all webhook events are selected
- Check database for subscription record:
  ```sql
  SELECT * FROM subscriptions WHERE workspace_id = 'test';
  ```

---

## Quick Reference

### Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

### Stripe Links
- Products: https://dashboard.stripe.com/test/products
- API Keys: https://dashboard.stripe.com/test/apikeys
- Webhooks: https://dashboard.stripe.com/test/webhooks
- Payments: https://dashboard.stripe.com/test/payments

### Vercel Commands
```bash
vercel env ls                    # List all env vars
vercel env pull                  # Download env vars locally
vercel logs                      # View deployment logs
vercel --prod                    # Deploy to production
```
