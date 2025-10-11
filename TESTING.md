# Payment System Testing Guide

## Overview

This guide explains how to test the Stripe payment system in a **separate testing environment** while keeping your production app running **FREE for everyone**.

---

## 🎯 Deployment Strategy

### **Production (Current - FREE)**
- **URL**: `marketscannerpros.app` 
- **Status**: Everyone gets Pro Trader FREE
- **Config**: `ENABLE_PAYMENTS=false`

### **Testing Environment (NEW - Payments Active)**
- **URL**: `test-marketscannerpros.vercel.app` (or custom subdomain)
- **Status**: Full payment system active
- **Config**: `ENABLE_PAYMENTS=true`

---

## 📋 Step 1: Create Test Deployment

### Option A: Separate Vercel Project (Recommended)

1. **Fork/Branch Your Repo**
   ```bash
   git checkout -b testing-payments
   ```

2. **Create New Vercel Project**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New" → "Project"
   - Import same Git repository
   - Name it: `marketscannerpros-test`
   - Set branch: `testing-payments`

3. **Environment Variables (Testing)**
   ```bash
   # Payments ENABLED
   ENABLE_PAYMENTS=true
   
   # Stripe TEST keys
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_PRO=price_test_...
   STRIPE_PRICE_PRO_TRADER=price_test_...
   
   # Other required vars
   APP_SIGNING_SECRET=your-secret-key
   DATABASE_URL=your-postgres-url
   MARKET_API_URL=https://test-marketscannerpros.vercel.app
   ```

### Option B: Environment-Based Deployment

1. **Use Same Project, Different Environment**
   - Deploy to Vercel preview deployment
   - Set environment variables per-deployment

---

## 📋 Step 2: Set Up Stripe Test Mode

1. **Go to Stripe Dashboard** (Test Mode ON)
   - Switch to: **Test mode** (toggle in top right)

2. **Create Products & Prices**
   ```
   Product 1: Pro
   - Price: $4.99/month
   - Copy price ID → STRIPE_PRICE_PRO
   
   Product 2: Pro Trader
   - Price: $9.99/month
   - Copy price ID → STRIPE_PRICE_PRO_TRADER
   ```

3. **Set Up Webhook**
   ```
   Endpoint URL: https://test-marketscannerpros.vercel.app/api/payments/webhook
   
   Events to receive:
   ✓ checkout.session.completed
   ✓ customer.subscription.created
   ✓ customer.subscription.updated
   ✓ customer.subscription.deleted
   
   Copy webhook secret → STRIPE_WEBHOOK_SECRET
   ```

4. **Get API Keys**
   ```
   Developers → API Keys
   - Secret key (sk_test_...) → STRIPE_SECRET_KEY
   ```

---

## 📋 Step 3: Update Streamlit Environment

**For Testing Deployment:**

Create `.streamlit/secrets.toml` or set environment variables:

```toml
APP_SIGNING_SECRET = "your-secret-key"
MARKET_API_URL = "https://test-marketscannerpros.vercel.app"
ENABLE_PAYMENTS = "true"
```

---

## 🧪 Step 4: Test Payment Flow

### Test Checkout Flow

1. **Open Test App**
   - Visit: `https://test-marketscannerpros.vercel.app`
   - You should see tier as "free" (not auto-upgraded)

2. **Click Upgrade Button**
   - Should redirect to Stripe checkout
   - Use test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits

3. **Complete Payment**
   - Should redirect to success page
   - Check database: subscription should be created

4. **Verify Tier**
   - Refresh app
   - Tier should now be "pro" or "pro_trader"
   - Features should be unlocked

### Test Webhook Events

1. **Trigger Subscription Update**
   - In Stripe dashboard, pause subscription
   - Webhook should update database status

2. **Cancel Subscription**
   - Cancel subscription in Stripe
   - Webhook should set tier back to "free"

### Test Customer Portal

1. **Click "Manage Billing"**
   - Should open Stripe customer portal
   - Verify can update payment method
   - Verify can cancel subscription

---

## 🔍 Step 5: Monitor & Debug

### Check Logs

**Vercel Logs:**
```bash
vercel logs --project=marketscannerpros-test
```

**Stripe Webhook Logs:**
- Go to: Developers → Webhooks
- Click on your webhook
- View "Recent deliveries"

**Database Queries:**
```sql
-- Check subscriptions
SELECT * FROM subscriptions ORDER BY updated_at DESC LIMIT 10;

-- Check customers
SELECT * FROM billing_customers ORDER BY created_at DESC LIMIT 10;
```

### Common Issues

**Issue: Webhook not receiving events**
- Verify webhook URL is correct
- Check Stripe webhook logs for errors
- Verify STRIPE_WEBHOOK_SECRET matches

**Issue: Tier not updating**
- Check API route `/api/subscription-status`
- Verify workspace ID signature is valid
- Check database for subscription record

**Issue: Checkout fails**
- Verify Stripe price IDs are correct
- Check ENABLE_PAYMENTS=true
- Look at checkout API logs

---

## ✅ Step 6: Production Rollout

Once testing is complete:

### Update Production Environment

1. **Set Production Stripe Keys**
   ```bash
   # Production Vercel project
   ENABLE_PAYMENTS=true
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_live_...
   STRIPE_PRICE_PRO=price_live_...
   STRIPE_PRICE_PRO_TRADER=price_live_...
   ```

2. **Update Webhook URL**
   ```
   In Stripe (live mode):
   https://marketscannerpros.app/api/payments/webhook
   ```

3. **Test with Real Card** (small amount first)
   - Use your own card to verify
   - Check full flow works
   - Verify webhook events fire

4. **Go Live!**
   - Deploy to production
   - Monitor first few transactions
   - Watch Sentry for errors

---

## 🔒 Security Checklist

- [ ] Test keys used in testing environment only
- [ ] Live keys used in production only
- [ ] Webhook secrets properly configured
- [ ] APP_SIGNING_SECRET is strong and secret
- [ ] Database has proper indexes on workspace_id
- [ ] Rate limiting is active
- [ ] Sentry monitoring is enabled

---

## 📊 Testing Checklist

- [ ] Free tier users see upgrade prompts
- [ ] Upgrade button creates checkout session
- [ ] Test card payment completes successfully
- [ ] Webhook updates database correctly
- [ ] Tier changes reflect in Streamlit immediately
- [ ] Features unlock based on tier
- [ ] Customer portal allows subscription management
- [ ] Cancellation downgrades tier to free
- [ ] Workspace ID persists across sessions
- [ ] Signature verification prevents tampering

---

## 💡 Tips

**Keep Both Deployments:**
- Production: Free for current users
- Testing: Full payment testing
- Gradually migrate users when ready

**Use Test Cards:**
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- 3D Secure: `4000 0025 0000 3155`

**Monitor Everything:**
- Stripe dashboard (test & live)
- Vercel logs
- Database queries
- Sentry errors

---

## 🆘 Support

**Stripe Issues:**
- [Stripe Testing Guide](https://stripe.com/docs/testing)
- [Webhook Testing](https://stripe.com/docs/webhooks/test)

**Vercel Issues:**
- [Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
- [Preview Deployments](https://vercel.com/docs/concepts/deployments/preview-deployments)

**Database Issues:**
- Check connection pool status
- Verify migrations are applied
- Look for constraint violations
