#!/bin/bash

echo "🚀 Building Market Scanner Native Apps with Capacitor..."

# Ensure we're in the correct directory
cd "$(dirname "$0")"

# Update capacitor config with your deployed URL
echo "⚙️ Updating Capacitor configuration..."
echo "⚠️  IMPORTANT: Update capacitor.config.ts with your deployed domain"
echo "   Replace 'https://YOURDOMAIN' with your actual Replit app URL"
echo "   Example: https://your-app.replit.app"

# Initialize Capacitor (if not already done)
echo "⚡ Initializing Capacitor..."
npx cap init "Market Scanner" "com.yourcompany.marketscanner" --web-dir="web-build"

# Add platforms
echo "📱 Adding iOS and Android platforms..."
npx cap add ios || echo "iOS already added or unavailable"
npx cap add android || echo "Android already added or unavailable"

# Sync web assets to native projects
echo "🔄 Syncing assets..."
npx cap sync

echo "✅ Native apps ready!"
echo ""
echo "📋 Next Steps:"
echo "1. Update web-build/index.html with your deployed app URL"
echo "2. For iOS: Run 'npm run open-ios' (requires Xcode on macOS)"
echo "3. For Android: Run 'npm run open-android' (requires Android Studio)"
echo ""
echo "🚀 App Store Distribution:"
echo "• iOS: Build and distribute through Xcode to App Store"
echo "• Android: Generate signed APK/AAB through Android Studio for Google Play"