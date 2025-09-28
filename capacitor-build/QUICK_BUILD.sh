#!/bin/bash

echo "🚀 Market Scanner - Quick Mobile App Builder"
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [[ ! -f "capacitor.config.ts" ]]; then
    echo -e "${RED}❌ Error: Please run this script from the capacitor-build directory${NC}"
    echo "Usage: cd capacitor-build && ./QUICK_BUILD.sh"
    exit 1
fi

# Environment checks
echo -e "${BLUE}🔍 Checking build environment...${NC}"

# Check Java
if ! command -v java &> /dev/null; then
    echo -e "${RED}❌ Java not found. Please install JDK 17+${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Java found${NC}"
fi

# Check Android SDK (if building Android)
if [[ -z "$ANDROID_HOME" ]] && [[ -z "$ANDROID_SDK_ROOT" ]]; then
    echo -e "${YELLOW}⚠️ ANDROID_HOME not set. Android builds may fail.${NC}"
    echo "Please set ANDROID_HOME to your Android SDK path"
else
    echo -e "${GREEN}✅ Android SDK configured${NC}"
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Please install Node.js 16+${NC}"
    exit 1
else
    echo -e "${GREEN}✅ Node.js found${NC}"
fi

echo -e "${BLUE}📋 What would you like to build?${NC}"
echo "1) Android Debug APK (for testing)"
echo "2) Android Release APK (for distribution)" 
echo "3) Android AAB (for Google Play Store)"
echo "4) iOS Project (opens Xcode)"
echo "5) Both Android & iOS setup"
echo "6) Just sync projects"

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo -e "${YELLOW}🔨 Building Android Debug APK...${NC}"
        npx cap sync android
        cd android
        ./gradlew assembleDebug
        echo -e "${GREEN}✅ Debug APK built: android/app/build/outputs/apk/debug/app-debug.apk${NC}"
        ;;
    2)
        echo -e "${YELLOW}🔨 Building Android Release APK...${NC}"
        if [[ ! -f "android/gradle.properties" ]]; then
            echo -e "${RED}❌ Missing android/gradle.properties for signing${NC}"
            echo "Copy android/gradle.properties.example to android/gradle.properties and configure your keystore"
            exit 1
        fi
        npx cap sync android
        cd android
        ./gradlew assembleRelease
        echo -e "${GREEN}✅ Release APK built: android/app/build/outputs/apk/release/app-release.apk${NC}"
        ;;
    3)
        echo -e "${YELLOW}🔨 Building Android AAB for Google Play...${NC}"
        if [[ ! -f "android/gradle.properties" ]]; then
            echo -e "${RED}❌ Missing android/gradle.properties for signing${NC}"
            echo "Copy android/gradle.properties.example to android/gradle.properties and configure your keystore"
            exit 1
        fi
        npx cap sync android
        cd android
        ./gradlew bundleRelease
        echo -e "${GREEN}✅ AAB built: android/app/build/outputs/bundle/release/app-release.aab${NC}"
        ;;
    4)
        echo -e "${YELLOW}🍎 Setting up iOS project...${NC}"
        npx cap sync ios
        echo -e "${GREEN}✅ Opening Xcode...${NC}"
        npx cap open ios
        ;;
    5)
        echo -e "${YELLOW}📱 Setting up both platforms...${NC}"
        echo -e "${BLUE}Syncing Android...${NC}"
        npx cap sync android
        echo -e "${BLUE}Syncing iOS...${NC}"
        npx cap sync ios
        echo -e "${GREEN}✅ Both platforms ready!${NC}"
        echo -e "${YELLOW}Next steps:${NC}"
        echo "Android: cd android && ./gradlew assembleDebug"
        echo "iOS: npx cap open ios"
        ;;
    6)
        echo -e "${YELLOW}🔄 Syncing projects...${NC}"
        npx cap sync
        echo -e "${GREEN}✅ Projects synced!${NC}"
        ;;
    *)
        echo -e "${RED}❌ Invalid choice. Please run the script again.${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}🎉 Build process completed!${NC}"
echo -e "${BLUE}📱 Your Market Scanner app connects to: https://market-scanner-1-wesso80.replit.app${NC}"
echo ""
echo -e "${YELLOW}💡 Need help?${NC}"
echo "- Check BUILD_MOBILE_APPS.md for detailed instructions"
echo "- For Android: Ensure Android Studio and SDK are installed"
echo "- For iOS: Requires macOS with Xcode installed"