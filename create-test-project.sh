#!/bin/bash
set -e

echo "🧪 Market Scanner - Test Project Setup"
echo "======================================"
echo ""
echo "This will create a SEPARATE test project alongside your production deployment"
echo ""

# Check dependencies
if ! command -v vercel &> /dev/null; then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

if ! command -v jq &> /dev/null; then
    echo "Note: jq not installed (optional for JSON parsing)"
fi

# Step 1: Create test directory
echo "📁 Step 1: Creating test project structure..."
mkdir -p ../marketscanner-test
cp -r ./* ../marketscanner-test/ 2>/dev/null || true
cp -r ./.* ../marketscanner-test/ 2>/dev/null || true
cd ../marketscanner-test

echo "✅ Test project created at: $(pwd)"
echo ""

# Step 2: Get Stripe credentials
echo "🔑 Step 2: Stripe Test Mode Setup"
echo "----------------------------------"
echo "Open: https://dashboard.stripe.com/test/apikeys"
echo ""
read -p "Stripe Secret Key (sk_test_...): " STRIPE_SK
read -p "Stripe Price - Pro (price_...): " PRICE_PRO
read -p "Stripe Price - Pro Trader (price_...): " PRICE_PT
echo ""
read -p "App Signing Secret (random string): " SIGN_SECRET
read -p "Database URL: " DB_URL
echo ""

# Step 3: Create .env file
cat > .env.local <<EOF
# Test Environment - Payments ENABLED
ENABLE_PAYMENTS=true
NEXT_PUBLIC_ENABLE_PAYMENTS=true

# Stripe Test Mode
STRIPE_SECRET_KEY=$STRIPE_SK
STRIPE_WEBHOOK_SECRET=whsec_temp_will_update
STRIPE_PRICE_PRO=$PRICE_PRO
STRIPE_PRICE_PRO_TRADER=$PRICE_PT

# App Config
APP_SIGNING_SECRET=$SIGN_SECRET
DATABASE_URL=$DB_URL

# URLs (will update after deployment)
NEXT_PUBLIC_APP_URL=https://marketscannerpros-test.vercel.app
NEXT_PUBLIC_MARKETING_URL=https://marketscannerpros-test.vercel.app
CHECKOUT_SUCCESS_URL=https://marketscannerpros-test.vercel.app/success
CHECKOUT_CANCEL_URL=https://marketscannerpros-test.vercel.app/cancel
PORTAL_RETURN_URL=https://marketscannerpros-test.vercel.app/account
MARKET_API_URL=https://marketscannerpros-test.vercel.app
EOF

echo "✅ Environment file created"
echo ""

# Step 4: Deploy to Vercel
echo "🚀 Step 3: Deploying to Vercel..."
echo ""
echo "When prompted:"
echo "  - Set up and deploy: YES"
echo "  - Link to existing project: NO (create new)"
echo "  - Project name: marketscannerpros-test"
echo "  - Deploy to production: YES"
echo ""
read -p "Press Enter to continue..."

vercel --prod

# Get deployment URL
DEPLOY_URL=$(vercel ls --token=$VERCEL_TOKEN 2>/dev/null | grep production | awk '{print $2}' | head -1)
if [ -z "$DEPLOY_URL" ]; then
    echo ""
    read -p "Enter your deployment URL (from above): " DEPLOY_URL
fi

echo ""
echo "✅ DEPLOYED TO: $DEPLOY_URL"
echo ""

# Step 5: Update webhook
echo "📡 Step 4: Set Up Stripe Webhook"
echo "---------------------------------"
echo ""
echo "1. Go to: https://dashboard.stripe.com/test/webhooks"
echo "2. Click 'Add endpoint'"
echo "3. Endpoint URL: https://$DEPLOY_URL/api/payments/webhook"
echo "4. Select events:"
echo "   ✓ checkout.session.completed"
echo "   ✓ customer.subscription.created"
echo "   ✓ customer.subscription.updated"
echo "   ✓ customer.subscription.deleted"
echo "5. Click 'Add endpoint'"
echo "6. Copy the 'Signing secret' (whsec_...)"
echo ""
read -p "Paste Webhook Signing Secret: " WEBHOOK_SECRET
echo ""

# Update webhook secret
echo "$WEBHOOK_SECRET" | vercel env add STRIPE_WEBHOOK_SECRET production

echo "✅ Webhook configured"
echo ""

# Step 6: Redeploy
echo "🔄 Step 5: Redeploying with webhook secret..."
vercel --prod

echo ""
echo "✅ TEST ENVIRONMENT READY!"
echo ""
echo "┌─────────────────────────────────────┐"
echo "│  TEST DEPLOYMENT INFO               │"
echo "├─────────────────────────────────────┤"
echo "│  URL: $DEPLOY_URL"
echo "│  Payments: ENABLED (test mode)      │"
echo "│  Database: Connected                │"
echo "│  Webhooks: Configured                │"
echo "└─────────────────────────────────────┘"
echo ""
echo "🧪 TESTING INSTRUCTIONS:"
echo ""
echo "1. Open: https://$DEPLOY_URL/pricing"
echo "2. Click 'Upgrade to Pro' or 'Upgrade to Pro Trader'"
echo "3. Use test card: 4242 4242 4242 4242"
echo "4. Expiry: 12/34, CVC: 123, ZIP: 12345"
echo "5. Complete checkout"
echo "6. Verify subscription in Stripe Dashboard"
echo ""
echo "📊 Monitor:"
echo "  - Stripe Dashboard: https://dashboard.stripe.com/test/payments"
echo "  - Vercel Logs: vercel logs"
echo "  - Database: Check subscriptions table"
echo ""
echo "🔙 Return to main project: cd -"
echo ""
