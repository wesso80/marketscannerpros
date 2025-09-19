#!/bin/bash

# Market Scanner Android APK Build Script
# Replace YOUR_DEPLOYED_DOMAIN with your actual Replit app domain

DOMAIN="YOUR_DEPLOYED_DOMAIN"  # Example: https://market-scanner.your-username.repl.co

echo "🚀 Building Market Scanner Android APK..."
echo "Using domain: $DOMAIN"

# Initialize Bubblewrap project
npx bubblewrap init --manifest="${DOMAIN}/manifest.webmanifest"

# The command above will prompt you for:
# - App name: Market Scanner
# - Package ID: com.marketscanner.app (or your preference)
# - Signing key: Choose to generate new one
# - App version: 1
# - Target Android version: Latest

# After answering prompts, build the APK
echo "Building APK..."
npx bubblewrap build

echo "✅ APK build complete!"
echo "📱 Your Market Scanner APK will be in the app/build/outputs/apk/release/ directory"
echo "🚀 You can now upload this to Google Play Console"