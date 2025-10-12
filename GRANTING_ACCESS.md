# How to Grant Access to Paid Customers

## 🎯 **Quick Start Guide**

When someone pays $4.99/month, you upgrade them in **2 minutes**. Here's the simple process:

---

## **Step 1: Customer Pays** ✅

Customer clicks "Upgrade to Pro" → Stripe checkout → Pays $4.99/month

**What happens:**
- ✅ Stripe processes payment
- ✅ You get email notification
- ✅ Subscription shows in Stripe dashboard

---

## **Step 2: Find Their Workspace ID** 🔍

You need their **workspace ID** to upgrade them. Two ways to get it:

### **Option A: Ask the Customer** (Easiest)
Send them this message:

```
Hi! To activate your Pro subscription, please:

1. Go to https://app.marketscannerpros.app
2. Press F12 (opens developer tools)
3. Click "Console" tab
4. Type: document.cookie
5. Look for workspace_id=wks_XXXXX
6. Send me that workspace ID

Thanks!
```

### **Option B: From Stripe Dashboard**
1. Go to https://dashboard.stripe.com/subscriptions
2. Click the subscription
3. Customer email is shown
4. Check your `billing_customers` table:
   ```sql
   SELECT workspace_id FROM billing_customers 
   WHERE stripe_customer_id = 'cus_XXX';
   ```

---

## **Step 3: Upgrade User** 🚀

### **In Production (Vercel):**

1. Go to your Vercel project dashboard
2. Click "Storage" → "Postgres" → "Query"
3. Run this SQL:

```sql
INSERT INTO subscriptions (workspace_id, tier, status, provider, updated_at)
VALUES ('wks_CUSTOMER_ID_HERE', 'paid', 'active', 'stripe', NOW())
ON CONFLICT (workspace_id)
DO UPDATE SET
  tier = 'paid',
  status = 'active',
  provider = 'stripe',
  updated_at = NOW();
```

Replace `wks_CUSTOMER_ID_HERE` with their actual workspace ID.

### **Alternative: Use Script (If Running Locally):**

```bash
node scripts/upgrade-user.js wks_CUSTOMER_ID_HERE
```

---

## **Step 4: Notify Customer** ✉️

Send them an email:

```
Subject: Welcome to Market Scanner Pro! 🎉

Your Pro subscription is now active!

Refresh the app to access all features:
https://app.marketscannerpros.app

You now have:
✅ Unlimited Price Alerts
✅ Trade Journal
✅ Strategy Backtesting
✅ Email Notifications
✅ Priority Support

Questions? Just reply to this email.

Thanks for upgrading!
```

---

## **Verifying It Worked** ✅

Customer should:
1. Refresh the app
2. See "Pro" badge/tier
3. Have access to all features

To verify in database:
```sql
SELECT workspace_id, tier, status 
FROM subscriptions 
WHERE workspace_id = 'wks_XXX';
```

Should show:
- tier: `paid`
- status: `active`

---

## **Handling Cancellations** ⚠️

When subscription ends/cancels in Stripe:

```sql
UPDATE subscriptions 
SET tier = 'free', status = 'canceled', updated_at = NOW()
WHERE workspace_id = 'wks_XXX';
```

---

## **Quick Reference**

**Average time per customer:** 2 minutes
**Tools needed:** Stripe dashboard + Vercel dashboard
**Manual work:** Only until you set up webhooks (optional)

---

## **Going Automatic (Optional Later)**

Once you have 10+ customers, set up Stripe webhooks:
- Webhook listens for `customer.subscription.created`
- Auto-upgrades user to `paid`
- Zero manual work

For now, this manual process works perfectly! 🎉
