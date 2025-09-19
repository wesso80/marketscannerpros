#!/bin/bash

# Market Scanner Android APK Build Script
# Replace YOUR_DEPLOYED_DOMAIN with your actual Replit app domain

DOMAIN="YOUR_DEPLOYED_DOMAIN"  # Example: https://market-scanner.your-username.repl.co

echo "🚀 Building Market Scanner Android APK..."
echo "Using domain: $DOMAIN"

# Initialize Bubblewrap project
npx bubblewrap init --manifest="${DOMAIN}/static/manifest.webmanifest"

# The command above will prompt you for:
# - App name: Market Scanner
# - Package ID: com.yourcompany.marketscanner (MUST match assetlinks.json!)
# - Signing key: Choose to generate new one
# - App version: 1
# - Target Android version: Latest

# After initialization, get the certificate fingerprint
echo "📋 Getting certificate fingerprint..."
npx bubblewrap fingerprint

echo "⚠️  IMPORTANT: Copy the SHA-256 fingerprint and update your assetlinks.json file!"
echo "   Replace 'AB:CD:EF:...:12' with your actual fingerprint"
echo "   File location: static/.well-known/assetlinks.json"
echo "   This file must be accessible at: ${DOMAIN}/.well-known/assetlinks.json"
echo "   NOTE: Streamlit serves files from /static, so assetlinks.json must be configured"
echo "   to be reachable at domain root. Contact hosting provider if needed."

# After answering prompts, build the APK
echo "Building APK..."
npx bubblewrap build

echo "✅ APK build complete!"
echo "📱 Your Market Scanner APK will be in the app/build/outputs/apk/release/ directory"
echo "🚀 You can now upload this to Google Play Console"

echo ""
echo "📝 Final checklist:"
echo "   ✓ assetlinks.json updated with real fingerprint"
echo "   ✓ Package name matches in assetlinks.json and APK"
echo "   ✓ File accessible at ${DOMAIN}/.well-known/assetlinks.json"