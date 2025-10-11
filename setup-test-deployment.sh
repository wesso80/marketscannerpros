#!/bin/bash
set -e

echo "🚀 Market Scanner Test Deployment Setup"
echo "========================================"
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi

echo "✅ Vercel CLI ready"
echo ""

# Step 1: Create test branch
echo "📦 Step 1: Creating test branch..."
git checkout -b test-payments 2>/dev/null || git checkout test-payments
git push -u origin test-payments || echo "Branch already exists on remote"
echo ""

# Step 2: Prompt for Stripe credentials
echo "🔑 Step 2: Stripe Test Credentials"
echo "-----------------------------------"
echo "Go to: https://dashboard.stripe.com/test/apikeys"
echo ""

read -p "Enter STRIPE_SECRET_KEY (sk_test_...): " STRIPE_SECRET_KEY
read -p "Enter STRIPE_WEBHOOK_SECRET (whsec_...): " STRIPE_WEBHOOK_SECRET
read -p "Enter STRIPE_PRICE_PRO (price_...): " STRIPE_PRICE_PRO
read -p "Enter STRIPE_PRICE_PRO_TRADER (price_...): " STRIPE_PRICE_PRO_TRADER
read -p "Enter APP_SIGNING_SECRET (any random string): " APP_SIGNING_SECRET
read -p "Enter DATABASE_URL: " DATABASE_URL

echo ""
echo "✅ Credentials collected"
echo ""

# Step 3: Link to Vercel (create new project)
echo "🔗 Step 3: Creating new Vercel project..."
echo "Name it: marketscannerpros-test"
echo ""

vercel link --yes

# Step 4: Set environment variables
echo "⚙️  Step 4: Setting environment variables..."
echo ""

# Server-side env vars
echo "$ENABLE_PAYMENTS" | vercel env add ENABLE_PAYMENTS production
echo "$STRIPE_SECRET_KEY" | vercel env add STRIPE_SECRET_KEY production
echo "$STRIPE_WEBHOOK_SECRET" | vercel env add STRIPE_WEBHOOK_SECRET production
echo "$STRIPE_PRICE_PRO" | vercel env add STRIPE_PRICE_PRO production
echo "$STRIPE_PRICE_PRO_TRADER" | vercel env add STRIPE_PRICE_PRO_TRADER production
echo "$APP_SIGNING_SECRET" | vercel env add APP_SIGNING_SECRET production
echo "$DATABASE_URL" | vercel env add DATABASE_URL production

# Client-side env var (for pricing page toggle)
echo "true" | vercel env add NEXT_PUBLIC_ENABLE_PAYMENTS production

echo ""
echo "✅ Environment variables configured"
echo ""

# Step 5: Deploy
echo "🚀 Step 5: Deploying to production..."
vercel --prod

echo ""
echo "✅ TEST DEPLOYMENT COMPLETE!"
echo ""
echo "📋 Next Steps:"
echo "1. Copy your deployment URL from above"
echo "2. Go to Stripe Dashboard → Webhooks"
echo "3. Add webhook endpoint: https://YOUR-URL/api/payments/webhook"
echo "4. Select events: checkout.session.completed, customer.subscription.*"
echo "5. Copy webhook secret and update STRIPE_WEBHOOK_SECRET if needed"
echo ""
echo "🧪 Test with card: 4242 4242 4242 4242"
