# Manual Payment Process

## Simple Payment Flow

1. **Customer clicks "Upgrade to Pro"** on pricing page
2. **Redirects to Stripe checkout** (payment link)
3. **Customer pays $4.99/month**
4. **You get email from Stripe** with payment details
5. **You manually upgrade them** using the script below

---

## How to Upgrade a Paid User

### Step 1: Get Customer Email from Stripe

When someone pays:
1. You'll receive an email from Stripe
2. The email contains customer details
3. Note their **email address**

### Step 2: Find Their Workspace ID

Option A - Check your database:
```sql
SELECT workspace_id FROM billing_customers WHERE stripe_customer_id = 'cus_...';
```

Option B - Ask customer to provide workspace ID from their browser console:
- They go to app
- Press F12 (developer tools)
- Type: `document.cookie`
- Look for `workspace_id=...`

### Step 3: Upgrade User

Run this command:
```bash
node scripts/upgrade-user.js <workspace-id>
```

Example:
```bash
node scripts/upgrade-user.js wks_abc123xyz
```

You'll see:
```
✅ Success! User upgraded to PAID tier
Workspace wks_abc123xyz now has full access to all features.
```

### Step 4: Notify Customer

Send them an email:
```
Subject: Welcome to Market Scanner Pro!

Your subscription is now active. 

Refresh the app to access all Pro features:
- Unlimited Price Alerts
- Trade Journal  
- Strategy Backtesting
- Email Notifications

https://app.marketscannerpros.app

Thanks!
```

---

## Checking User Status

To see all paid users:
```sql
SELECT workspace_id, tier, status, updated_at 
FROM subscriptions 
WHERE tier = 'paid';
```

To check a specific user:
```sql
SELECT * FROM subscriptions WHERE workspace_id = 'wks_...';
```

---

## Downgrading Users

If subscription cancels or fails:
```bash
node scripts/downgrade-user.js <workspace-id>
```

(You can create this script following the same pattern as upgrade-user.js)

---

## Going Automatic Later

When you're ready to automate:
1. Set up Stripe webhooks
2. Webhooks automatically call upgrade/downgrade
3. No manual work needed

For now, this manual process:
- ✅ Works immediately
- ✅ No complex code
- ✅ Easy to troubleshoot
- ✅ You control everything
