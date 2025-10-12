#!/bin/bash
set -e

echo "🧪 Test Deployment - Fixed Version"
echo "==================================="
echo ""

# Install Vercel CLI if needed
if ! command -v vercel &> /dev/null; then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

# Collect credentials
echo "📋 STRIPE SETUP:"
echo "1. https://dashboard.stripe.com/test/products - Create Pro ($4.99) and Pro Trader ($9.99)"
echo "2. https://dashboard.stripe.com/test/apikeys - Get Secret Key"
echo ""
read -p "STRIPE_SECRET_KEY (sk_test_...): " STRIPE_SK
read -p "STRIPE_PRICE_PRO (price_...): " PRICE_PRO
read -p "STRIPE_PRICE_PRO_TRADER (price_...): " PRICE_PT
echo ""
read -p "APP_SIGNING_SECRET (from Replit secrets): " SIGN_SECRET
read -p "DATABASE_URL (from Replit secrets): " DB_URL
echo ""

# Step 1: Link to new project or create one
echo "🔗 Step 1: Linking to Vercel..."
echo ""
echo "When prompted, choose:"
echo "  - Link to existing project? NO"
echo "  - What's your project's name? marketscannerpros-test"
echo "  - In which directory is your code located? ./"
echo ""
read -p "Press Enter to continue..."

vercel link

# Step 2: Add environment variables to the PROJECT (not just deployment)
echo ""
echo "⚙️  Step 2: Adding environment variables..."
echo ""

# Add to production, preview, and development
for ENV in production preview development; do
    echo "true" | vercel env add ENABLE_PAYMENTS "$ENV" 2>/dev/null || vercel env rm ENABLE_PAYMENTS "$ENV" -y && echo "true" | vercel env add ENABLE_PAYMENTS "$ENV"
    echo "true" | vercel env add NEXT_PUBLIC_ENABLE_PAYMENTS "$ENV" 2>/dev/null || vercel env rm NEXT_PUBLIC_ENABLE_PAYMENTS "$ENV" -y && echo "true" | vercel env add NEXT_PUBLIC_ENABLE_PAYMENTS "$ENV"
    echo "$STRIPE_SK" | vercel env add STRIPE_SECRET_KEY "$ENV" 2>/dev/null || vercel env rm STRIPE_SECRET_KEY "$ENV" -y && echo "$STRIPE_SK" | vercel env add STRIPE_SECRET_KEY "$ENV"
    echo "$PRICE_PRO" | vercel env add STRIPE_PRICE_PRO "$ENV" 2>/dev/null || vercel env rm STRIPE_PRICE_PRO "$ENV" -y && echo "$PRICE_PRO" | vercel env add STRIPE_PRICE_PRO "$ENV"
    echo "$PRICE_PT" | vercel env add STRIPE_PRICE_PRO_TRADER "$ENV" 2>/dev/null || vercel env rm STRIPE_PRICE_PRO_TRADER "$ENV" -y && echo "$PRICE_PT" | vercel env add STRIPE_PRICE_PRO_TRADER "$ENV"
    echo "$SIGN_SECRET" | vercel env add APP_SIGNING_SECRET "$ENV" 2>/dev/null || vercel env rm APP_SIGNING_SECRET "$ENV" -y && echo "$SIGN_SECRET" | vercel env add APP_SIGNING_SECRET "$ENV"
    echo "$DB_URL" | vercel env add DATABASE_URL "$ENV" 2>/dev/null || vercel env rm DATABASE_URL "$ENV" -y && echo "$DB_URL" | vercel env add DATABASE_URL "$ENV"
    echo "whsec_temp" | vercel env add STRIPE_WEBHOOK_SECRET "$ENV" 2>/dev/null || vercel env rm STRIPE_WEBHOOK_SECRET "$ENV" -y && echo "whsec_temp" | vercel env add STRIPE_WEBHOOK_SECRET "$ENV"
done

echo ""
echo "✅ Environment variables added to all environments"
echo ""

# Step 3: Deploy to production
echo "🚀 Step 3: Deploying to production..."
echo ""

vercel --prod --yes

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""

# Get the deployment URL
DEPLOY_URL=$(vercel ls 2>/dev/null | grep production | head -1 | awk '{print $2}')

if [ -z "$DEPLOY_URL" ]; then
    echo "📋 Copy your deployment URL from above"
    read -p "Enter deployment URL: " DEPLOY_URL
fi

echo ""
echo "┌────────────────────────────────────────┐"
echo "│  TEST DEPLOYMENT READY                 │"
echo "├────────────────────────────────────────┤"
echo "│  URL: $DEPLOY_URL"
echo "│  Payments: ENABLED (test mode)         │"
echo "└────────────────────────────────────────┘"
echo ""
echo "📡 NEXT: Configure Stripe Webhook"
echo ""
echo "1. Go to: https://dashboard.stripe.com/test/webhooks/create"
echo "2. Endpoint URL: https://$DEPLOY_URL/api/payments/webhook"
echo "3. Select events:"
echo "   ✓ checkout.session.completed"
echo "   ✓ customer.subscription.created"
echo "   ✓ customer.subscription.updated"
echo "   ✓ customer.subscription.deleted"
echo "4. Copy the signing secret (whsec_...)"
echo ""
read -p "Paste webhook signing secret: " WEBHOOK_SECRET
echo ""

# Update webhook secret
echo "$WEBHOOK_SECRET" | vercel env rm STRIPE_WEBHOOK_SECRET production -y
echo "$WEBHOOK_SECRET" | vercel env add STRIPE_WEBHOOK_SECRET production

echo ""
echo "🔄 Redeploying with webhook secret..."
vercel --prod --yes

echo ""
echo "✅ ALL DONE!"
echo ""
echo "🧪 TEST YOUR PAYMENT FLOW:"
echo ""
echo "1. Visit: https://$DEPLOY_URL/pricing"
echo "2. Click 'Upgrade to Pro Trader'"
echo "3. Use test card: 4242 4242 4242 4242"
echo "4. Expiry: 12/34, CVC: 123, ZIP: 12345"
echo "5. Complete checkout"
echo ""
echo "📊 MONITOR:"
echo "  • Stripe: https://dashboard.stripe.com/test/payments"
echo "  • Logs: vercel logs"
echo "  • Database: SELECT * FROM subscriptions;"
echo ""
