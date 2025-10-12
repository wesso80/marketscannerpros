#!/bin/bash
set -e

echo "🔧 Fixing Test Deployment Issues"
echo "================================="
echo ""

echo "❌ Issues Found:"
echo "1. Pricing page shows FREE mode (should show paid tiers)"
echo "2. Stripe price IDs incorrect or missing"
echo ""

# Fix 1: Set client-side flag
echo "📝 Fix 1: Setting NEXT_PUBLIC_ENABLE_PAYMENTS=true..."
echo "true" | vercel env rm NEXT_PUBLIC_ENABLE_PAYMENTS production -y 2>/dev/null || true
echo "true" | vercel env add NEXT_PUBLIC_ENABLE_PAYMENTS production

# Fix 2: Get Stripe price IDs
echo ""
echo "📝 Fix 2: Updating Stripe Price IDs"
echo ""
echo "Go to: https://dashboard.stripe.com/test/products"
echo "Copy the PRICE ID (starts with price_) for each product"
echo ""
read -p "Enter STRIPE_PRICE_PRO (price_...): " PRICE_PRO
read -p "Enter STRIPE_PRICE_PRO_TRADER (price_...): " PRICE_PT

# Update price IDs
vercel env rm STRIPE_PRICE_PRO production -y 2>/dev/null || true
vercel env rm STRIPE_PRICE_PRO_TRADER production -y 2>/dev/null || true
echo "$PRICE_PRO" | vercel env add STRIPE_PRICE_PRO production
echo "$PRICE_PT" | vercel env add STRIPE_PRICE_PRO_TRADER production

# Also ensure ENABLE_PAYMENTS is set
echo "true" | vercel env rm ENABLE_PAYMENTS production -y 2>/dev/null || true
echo "true" | vercel env add ENABLE_PAYMENTS production

echo ""
echo "✅ Environment variables updated!"
echo ""

# Redeploy
echo "🚀 Redeploying..."
vercel --prod

echo ""
echo "✅ DEPLOYMENT FIXED!"
echo ""
echo "🧪 TEST NOW:"
echo "1. Visit: https://marketscannerpros-test.vercel.app/pricing"
echo "   → Should see 'Choose Your Plan' with $4.99 and $9.99 tiers"
echo ""
echo "2. Click 'Upgrade to Pro Trader'"
echo "   → Should redirect to Stripe checkout"
echo ""
echo "3. Use test card: 4242 4242 4242 4242"
echo "   → Should complete payment successfully"
echo ""
