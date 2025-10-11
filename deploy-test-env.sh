#!/bin/bash
set -e

echo "🚀 Creating Test Deployment for Payment Testing"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}Installing Vercel CLI...${NC}"
    npm install -g vercel
fi

# Get current project info
CURRENT_PROJECT=$(vercel ls 2>/dev/null | head -1 || echo "unknown")
echo -e "${BLUE}Current production project: ${CURRENT_PROJECT}${NC}"
echo ""

# Stripe Setup Instructions
echo -e "${YELLOW}📋 BEFORE WE START - Get Your Stripe Test Keys:${NC}"
echo ""
echo "1. Go to: https://dashboard.stripe.com/test/apikeys"
echo "2. Copy your 'Secret key' (starts with sk_test_)"
echo "3. Create Products and Prices:"
echo "   - Product 1: Pro ($4.99/mo)"
echo "   - Product 2: Pro Trader ($9.99/mo)"
echo "4. Copy the Price IDs (start with price_)"
echo ""
read -p "Press Enter when you have your Stripe keys ready..."
echo ""

# Collect credentials
echo -e "${GREEN}🔑 Enter Your Credentials:${NC}"
echo ""
read -p "Stripe Secret Key (sk_test_...): " STRIPE_SECRET_KEY
read -p "Stripe Price ID - Pro (price_...): " STRIPE_PRICE_PRO
read -p "Stripe Price ID - Pro Trader (price_...): " STRIPE_PRICE_PRO_TRADER
read -p "App Signing Secret (any random string, e.g., your-secret-123): " APP_SIGNING_SECRET
read -p "Database URL (postgresql://...): " DATABASE_URL

# Webhook secret placeholder
STRIPE_WEBHOOK_SECRET="whsec_placeholder_update_after_deploy"

echo ""
echo -e "${GREEN}✅ Credentials collected${NC}"
echo ""

# Deploy with environment variables
echo -e "${BLUE}🚀 Deploying test environment...${NC}"
echo ""

# Use vercel --prod with env vars
vercel \
  --prod \
  --yes \
  -e ENABLE_PAYMENTS=true \
  -e NEXT_PUBLIC_ENABLE_PAYMENTS=true \
  -e STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY" \
  -e STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET" \
  -e STRIPE_PRICE_PRO="$STRIPE_PRICE_PRO" \
  -e STRIPE_PRICE_PRO_TRADER="$STRIPE_PRICE_PRO_TRADER" \
  -e APP_SIGNING_SECRET="$APP_SIGNING_SECRET" \
  -e DATABASE_URL="$DATABASE_URL"

echo ""
echo -e "${GREEN}✅ DEPLOYMENT COMPLETE!${NC}"
echo ""
echo -e "${YELLOW}📋 IMPORTANT NEXT STEPS:${NC}"
echo ""
echo "1. Copy your deployment URL from above (should end with .vercel.app)"
echo ""
echo "2. Set up Stripe Webhook:"
echo "   a. Go to: https://dashboard.stripe.com/test/webhooks"
echo "   b. Click 'Add endpoint'"
echo "   c. Endpoint URL: https://YOUR-DEPLOYMENT-URL/api/payments/webhook"
echo "   d. Select these events:"
echo "      - checkout.session.completed"
echo "      - customer.subscription.created"
echo "      - customer.subscription.updated"
echo "      - customer.subscription.deleted"
echo "   e. Click 'Add endpoint'"
echo "   f. Copy the 'Signing secret' (starts with whsec_)"
echo ""
echo "3. Update webhook secret:"
echo "   vercel env add STRIPE_WEBHOOK_SECRET production"
echo "   (paste the whsec_... value)"
echo ""
echo "4. Redeploy to apply webhook secret:"
echo "   vercel --prod"
echo ""
echo -e "${GREEN}🧪 Test with card: 4242 4242 4242 4242${NC}"
echo ""
