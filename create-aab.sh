#!/bin/bash

# Create AAB file for Google Play Store
echo "🚀 Creating Market Scanner AAB file..."

# Set up build directory
mkdir -p market-scanner-aab
cd market-scanner-aab

# Create twa-manifest.json for bubblewrap
cat > twa-manifest.json << EOF
{
  "packageId": "com.wesso80.marketscanner",
  "host": "market-scanner-1-wesso80.replit.app",
  "name": "Market Scanner",
  "launcherName": "Market Scanner",
  "display": "standalone",
  "themeColor": "#0b0f19",
  "backgroundColor": "#0b0f19",
  "startUrl": "/",
  "iconUrl": "https://market-scanner-1-wesso80.replit.app/static/icons/icon-512.png",
  "maskableIconUrl": "https://market-scanner-1-wesso80.replit.app/static/icons/maskable-512.png",
  "splashScreenFadeOutDuration": 300,
  "signingKey": {
    "path": "./android.keystore",
    "alias": "android"
  }
}
EOF

echo "📱 Building AAB file..."
echo "✅ Configuration created: twa-manifest.json"
echo "💡 To complete the build, run in terminal:"
echo "   cd market-scanner-aab"
echo "   bubblewrap build --skipPwaValidation"
echo ""
echo "📥 After build completes, download the AAB file:"
echo "   app-release-bundle.aab (in app/build/outputs/bundle/release/)"