# ✅ Payment System Ready!

Both sites are now set up for the new simplified payment system.

---

## **🎯 Current Status**

### **Payment Mode:** 
Currently set to **FREE** for everyone  
*(Controlled by `NEXT_PUBLIC_ENABLE_PAYMENTS=false`)*

### **What This Means:**
- All users get full Pro features for free
- No payments required
- You can switch to paid mode anytime

---

## **🏗️ How It Works**

### **Streamlit App (app.marketscannerpros.app)**
✅ Checks database for user tier  
✅ Supports 'free' and 'paid' tiers  
✅ API integration with Next.js  
✅ Shows correct tier status in sidebar

**Free Tier:**
- ✅ Unlimited market scanning
- ✅ Advanced charts
- ✅ Real-time data
- ❌ No price alerts
- ❌ No trade journal
- ❌ No backtesting

**Paid Tier ($4.99/month):**
- ✅ Everything in Free
- ✅ Unlimited price alerts
- ✅ Trade Journal
- ✅ Strategy Backtesting
- ✅ Email notifications
- ✅ Priority support

### **Next.js Site (marketscannerpros.app)**
✅ Payment link on /pricing page  
✅ API endpoint: `/api/subscription-status`  
✅ Checks `subscriptions` table correctly  
✅ Returns 'free' or 'paid' tier

---

## **💳 To Enable Paid Mode**

### **Step 1: Create Live Stripe Product**
Follow `STRIPE_LIVE_SETUP.md`:
1. Switch Stripe to live mode
2. Create $4.99/month product
3. Get payment link
4. Update pricing page

### **Step 2: Set Environment Variable**
In Vercel:
```
NEXT_PUBLIC_ENABLE_PAYMENTS=true
```

### **Step 3: Deploy**
```bash
vercel deploy --prod
```

### **Step 4: Grant Access to Customers**
Follow `GRANTING_ACCESS.md`:
1. Customer pays via Stripe
2. Get their workspace ID
3. Run SQL to upgrade:
```sql
INSERT INTO subscriptions (workspace_id, tier, status, provider, updated_at)
VALUES ('wks_CUSTOMER_ID', 'paid', 'active', 'stripe', NOW())
ON CONFLICT (workspace_id)
DO UPDATE SET tier = 'paid', status = 'active', updated_at = NOW();
```

---

## **📊 Database Tables**

### **subscriptions** (Main table)
```
workspace_id (uuid) - User's workspace
tier (text) - 'free' or 'paid'
status (text) - 'active', 'canceled', etc.
provider (text) - 'stripe'
updated_at (timestamp)
```

### **billing_customers** (Stripe mapping)
```
workspace_id (uuid)
stripe_customer_id (text)
```

---

## **🔧 Key Files**

**Documentation:**
- `GRANTING_ACCESS.md` - How to upgrade customers
- `STRIPE_LIVE_SETUP.md` - Create live Stripe product
- `MANUAL_PAYMENTS.md` - Manual payment workflow

**Code:**
- `app/pricing/page.tsx` - Pricing page with payment link
- `app/api/subscription-status/route.ts` - API for tier checking
- `lib/db.ts` - Database functions
- `streamlit_billing_client.py` - Streamlit tier checking
- `app.py` - Main Streamlit app (tier logic at line 5349)

**Scripts:**
- `scripts/upgrade-user.js` - Upgrade user to paid (needs DATABASE_URL fix)

---

## **🧪 Testing**

### **Test Payment Link:**
https://buy.stripe.com/test_aFacN6dl0c1peEg8iX9sk00

### **Test Flow:**
1. Go to pricing page
2. Click "Upgrade to Pro"
3. Complete test payment (4242 4242 4242 4242)
4. Check Stripe dashboard for subscription
5. Manually upgrade user in database
6. User refreshes app → sees Pro features

---

## **🚀 Ready to Go Live?**

When you're ready for real payments:
1. ✅ Follow `STRIPE_LIVE_SETUP.md`
2. ✅ Set `NEXT_PUBLIC_ENABLE_PAYMENTS=true`
3. ✅ Deploy both sites
4. ✅ Use `GRANTING_ACCESS.md` to upgrade customers

**Current mode: FREE for all users** 🎉
