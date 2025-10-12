# Test Deployment Diagnosis Report

## 🔍 Test Results for: marketscannerpros-test.vercel.app

### ❌ **Issues Found:**

#### 1. **Pricing Page Shows FREE Mode**
- **Expected**: "Choose Your Plan" with paid tiers
- **Actual**: "🎉 Free for Everyone!"
- **Root Cause**: `NEXT_PUBLIC_ENABLE_PAYMENTS` is NOT set to "true"

#### 2. **Checkout API Error**
- **Error**: `"No such price: 'prod_T6hnoewu0Tb9nY'"`
- **Root Cause**: Either:
  - Stripe price IDs not set correctly
  - Using product ID (`prod_xxx`) instead of price ID (`price_xxx`)
  - Wrong Stripe price IDs configured

#### 3. **Subscription Status API**
- **Error**: `"Missing wid"` (expected - needs valid workspace ID cookie)
- **Status**: ⚠️ Normal behavior without authenticated request

---

## 🔧 Required Fixes

### Fix 1: Set Client-Side Payment Flag
```bash
echo "true" | vercel env add NEXT_PUBLIC_ENABLE_PAYMENTS production --force
```

### Fix 2: Verify Stripe Price IDs
The price IDs should look like: `price_1ABC123xyz...` NOT `prod_1ABC123xyz...`

Get correct price IDs:
1. Go to: https://dashboard.stripe.com/test/products
2. Click on "Pro" product → Copy the **Price ID** (starts with `price_`)
3. Click on "Pro Trader" product → Copy the **Price ID** (starts with `price_`)

### Fix 3: Update Price IDs
```bash
# Remove old ones
vercel env rm STRIPE_PRICE_PRO production -y
vercel env rm STRIPE_PRICE_PRO_TRADER production -y

# Add correct ones (replace with YOUR actual price IDs)
echo "price_YOUR_PRO_PRICE_ID" | vercel env add STRIPE_PRICE_PRO production
echo "price_YOUR_PRO_TRADER_PRICE_ID" | vercel env add STRIPE_PRICE_PRO_TRADER production
```

### Fix 4: Redeploy
```bash
vercel --prod
```

---

## ✅ Expected Behavior After Fix

### 1. Pricing Page
```
Visit: https://marketscannerpros-test.vercel.app/pricing
Should show: "Choose Your Plan" with two paid tiers ($4.99 and $9.99)
```

### 2. Checkout API
```bash
curl -X POST "https://marketscannerpros-test.vercel.app/api/payments/checkout" \
  -H "Content-Type: application/json" \
  -d '{"plan":"pro","workspaceId":"test-123"}'

Should return: {"url":"https://checkout.stripe.com/..."}
```

### 3. Full Payment Flow
1. Click "Upgrade to Pro Trader"
2. Redirects to Stripe checkout
3. Enter test card: `4242 4242 4242 4242`
4. Completes payment → Webhook fires → Database updated

---

## 📋 Environment Variables Checklist

Required for test deployment:

- [ ] `ENABLE_PAYMENTS=true` (server-side)
- [ ] `NEXT_PUBLIC_ENABLE_PAYMENTS=true` (client-side) **← MISSING**
- [ ] `STRIPE_SECRET_KEY=sk_test_...`
- [ ] `STRIPE_PRICE_PRO=price_...` **← Check if correct**
- [ ] `STRIPE_PRICE_PRO_TRADER=price_...` **← Check if correct**
- [ ] `STRIPE_WEBHOOK_SECRET=whsec_...`
- [ ] `APP_SIGNING_SECRET=...`
- [ ] `DATABASE_URL=postgresql://...`

---

## 🚀 Quick Fix Commands

Run these in order:

```bash
# 1. Set client-side flag
echo "true" | vercel env add NEXT_PUBLIC_ENABLE_PAYMENTS production --force

# 2. Get your Stripe price IDs from dashboard
# https://dashboard.stripe.com/test/products

# 3. Update price IDs (replace with actual IDs)
vercel env rm STRIPE_PRICE_PRO production -y
vercel env rm STRIPE_PRICE_PRO_TRADER production -y
echo "price_YOUR_ACTUAL_PRO_ID" | vercel env add STRIPE_PRICE_PRO production
echo "price_YOUR_ACTUAL_PRO_TRADER_ID" | vercel env add STRIPE_PRICE_PRO_TRADER production

# 4. Redeploy
vercel --prod

# 5. Test pricing page
curl -s "https://marketscannerpros-test.vercel.app/pricing" | grep "Choose Your Plan"

# 6. Test checkout API
curl -X POST "https://marketscannerpros-test.vercel.app/api/payments/checkout" \
  -H "Content-Type: application/json" \
  -d '{"plan":"pro","workspaceId":"test"}'
```

---

## 📊 Current Status

| Component | Status | Issue |
|-----------|--------|-------|
| Deployment | ✅ Live | Working |
| Pricing Page | ❌ Wrong | Shows FREE instead of PAID |
| Checkout API | ❌ Error | Invalid Stripe price ID |
| Webhooks | ⚠️ Unknown | Can't test until checkout works |
| Database | ✅ Connected | No issues detected |

**Next Step**: Fix the environment variables and redeploy.
