# Setting Up Live Stripe Payments

## 🚀 **Go Live in 5 Minutes**

You've tested it, now let's make it real!

---

## **Step 1: Switch to Live Mode** 

1. Go to https://dashboard.stripe.com
2. Toggle from **Test mode** to **Live mode** (top right)
3. Complete Stripe account activation if needed (business info, bank account)

---

## **Step 2: Create Live Product** 

1. In **Live mode**, go to: https://dashboard.stripe.com/products
2. Click **"+ Add product"**
3. Fill in:
   - **Name:** Market Scanner Pro
   - **Description:** Full access to market scanning, alerts, trade journal, and backtesting
   - **Price:** $4.99
   - **Billing:** Recurring monthly
4. Click **"Save product"**

---

## **Step 3: Create Payment Link** 

1. Still on the product page, scroll to **"Payment links"**
2. Click **"Create payment link"**
3. Settings:
   - **Collect customer's email:** ✅ ON
   - **After payment:** Redirect to `https://marketscannerpros.app/success`
4. Click **"Create link"**
5. **Copy the link** (looks like: `https://buy.stripe.com/XXXXX`)

---

## **Step 4: Update Pricing Page**

Update `app/pricing/page.tsx` with your live payment link:

```tsx
<a 
  href="https://buy.stripe.com/YOUR_LIVE_LINK_HERE"
  target="_blank"
  rel="noopener noreferrer"
  className="btn"
>
  Upgrade to Pro
</a>
```

---

## **Step 5: Deploy**

```bash
vercel deploy --prod
```

**That's it!** Your payment system is live! 🎉

---

## **What Happens Next**

When a real customer pays:
1. They complete checkout ($4.99/month charged)
2. You get **email from Stripe** with their info
3. You **upgrade them** using GRANTING_ACCESS.md guide (2 minutes)
4. Customer gets full access

---

## **Important: Environment Variables**

Make sure these are set in Vercel (already done):
- ✅ `NEXT_PUBLIC_ENABLE_PAYMENTS` = `true`
- ✅ `STRIPE_SECRET_KEY` = `sk_live_...` (not sk_test_)

Check: https://vercel.com/your-project/settings/environment-variables

---

## **Testing Before Going Live**

Want to test the live link before real customers?
1. Use link in incognito mode
2. Use test card won't work in live mode
3. Use real card, then refund yourself in Stripe

---

## **Getting Help**

If Stripe asks for business verification:
- Have business name ready
- Bank account for payouts
- Business address
- Takes 1-3 days to approve

You're ready to accept real payments! 💰
