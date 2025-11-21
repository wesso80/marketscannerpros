#!/bin/bash
set -e

echo "🚀 Market Scanner Pro - iOS Build Script"
echo "========================================"
echo ""

# Step 1: Install EAS CLI globally
echo "📦 Step 1: Installing EAS CLI..."
npm install -g eas-cli

# Step 2: Install project dependencies
echo "📦 Step 2: Installing project dependencies..."
npm install

# Step 3: Login to Expo (requires browser)
echo "🔐 Step 3: Login to Expo..."
echo "   → This will open a browser window"
echo "   → Login with your Expo account"
eas login

# Step 4: Configure EAS project (if needed)
echo "⚙️  Step 4: Configure EAS project..."
eas build:configure

# Step 5: Build for iOS
echo "🏗️  Step 5: Building iOS app..."
echo "   → This will take 10-20 minutes"
echo "   → Building on Expo cloud servers"
eas build --platform ios --profile production

echo ""
echo "✅ Build complete!"
echo "   → Download the .ipa file from the link above"
echo "   → Upload to App Store Connect"
