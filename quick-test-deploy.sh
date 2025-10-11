#!/bin/bash
# Quick Test Deployment - All in One
# This creates environment variables and deploys

echo "🧪 Quick Test Deployment"
echo "========================"
echo ""

# Install Vercel if needed
command -v vercel >/dev/null 2>&1 || npm install -g vercel

# Check for Stripe products
echo "📋 STRIPE SETUP REQUIRED:"
echo ""
echo "1. Go to: https://dashboard.stripe.com/test/products"
echo "2. Create two products:"
echo "   • Pro - $4.99/month (copy the price_xxx ID)"
echo "   • Pro Trader - $9.99/month (copy the price_xxx ID)"
echo ""
echo "3. Go to: https://dashboard.stripe.com/test/apikeys"
echo "   • Copy the Secret Key (sk_test_xxx)"
echo ""
read -p "Press Enter when ready..."
clear

echo "🔑 ENTER CREDENTIALS:"
echo ""
read -p "STRIPE_SECRET_KEY (sk_test_...): " SK
read -p "STRIPE_PRICE_PRO (price_...): " PP
read -p "STRIPE_PRICE_PRO_TRADER (price_...): " PPT
read -sp "APP_SIGNING_SECRET (any secret): " SS
echo ""
read -p "DATABASE_URL: " DB

# Create env file for reference
cat > .env.test <<EOF
ENABLE_PAYMENTS=true
NEXT_PUBLIC_ENABLE_PAYMENTS=true
STRIPE_SECRET_KEY=$SK
STRIPE_PRICE_PRO=$PP
STRIPE_PRICE_PRO_TRADER=$PPT
APP_SIGNING_SECRET=$SS
DATABASE_URL=$DB
STRIPE_WEBHOOK_SECRET=whsec_UPDATE_AFTER_DEPLOY
EOF

echo ""
echo "✅ Credentials saved to .env.test"
echo ""
echo "🚀 Deploying now..."
echo ""

# Deploy with all env vars inline
vercel --yes --prod \
  -e ENABLE_PAYMENTS=true \
  -e NEXT_PUBLIC_ENABLE_PAYMENTS=true \
  -e STRIPE_SECRET_KEY="$SK" \
  -e STRIPE_PRICE_PRO="$PP" \
  -e STRIPE_PRICE_PRO_TRADER="$PPT" \
  -e APP_SIGNING_SECRET="$SS" \
  -e DATABASE_URL="$DB" \
  -e STRIPE_WEBHOOK_SECRET="whsec_temp"

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "📋 NEXT STEPS:"
echo ""
echo "1. Copy your .vercel.app URL from above"
echo ""
echo "2. Configure Stripe Webhook:"
echo "   → https://dashboard.stripe.com/test/webhooks/create"
echo "   → Endpoint: https://YOUR-URL/api/payments/webhook"
echo "   → Events: checkout.session.completed, customer.subscription.*"
echo "   → Copy the signing secret (whsec_...)"
echo ""
echo "3. Update webhook secret:"
echo '   echo "whsec_YOUR_SECRET" | vercel env add STRIPE_WEBHOOK_SECRET production'
echo "   vercel --prod"
echo ""
echo "4. Test payments:"
echo "   → Visit: YOUR-URL/pricing"
echo "   → Card: 4242 4242 4242 4242"
echo ""
