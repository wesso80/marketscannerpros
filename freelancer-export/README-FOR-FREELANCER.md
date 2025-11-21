# Market Scanner Pro - Mobile App Export

## Project Overview
This is a React Native/Expo mobile app wrapper for Market Scanner Pro. The app loads the live web application in a WebView.

**Live Web App URL:** https://app.marketscannerpros.app

## App Details
- **Bundle ID (iOS):** app.marketscannerpros
- **Package Name (Android):** app.marketscannerpros
- **App Name:** Market Scanner Pro
- **Expo SDK Version:** 50

## Project Structure
```
mobile-app/
├── App.js                 # Main app component with WebView
├── app.json              # Expo configuration
├── package.json          # Dependencies
├── eas.json             # EAS Build configuration
├── assets/              # App icons and splash screens
│   ├── icon.png
│   └── splash.png
└── README.md            # Original project README
```

## Setup Instructions

### 1. Install Dependencies
```bash
cd mobile-app
npm install
```

### 2. EAS Account Setup
This project uses **Expo Application Services (EAS)** for building iOS/Android apps.

**Important:** The client already has an EAS account with credentials configured:
- EAS Project ID: `0ebc6f5e-648c-4a6b-ae94-4b334c9bfac2`
- Apple Team ID: `P7PW224G4Y`
- Distribution certificates and provisioning profiles are already set up

**You'll need:**
- The client's EXPO_TOKEN (ask them to provide this)
- Or access to their Expo account (@wesso80)

### 3. Building the Apps

#### iOS Build
```bash
npx eas-cli build --platform ios --profile production
```

#### Android Build
```bash
npx eas-cli build --platform android --profile production
```

#### Both Platforms
```bash
npx eas-cli build --platform all --profile production
```

### 4. Testing Locally (Optional)
To test on your local device using Expo Go:
```bash
npx expo start
```

## Key Technical Notes

### WebView URL
The app loads: `https://app.marketscannerpros.app`

This URL is hardcoded in `App.js`. If the client changes their domain, update it there.

### Mobile UI Fixes
The web app has special CSS that positions the sidebar toggle button 50px lower on mobile devices to avoid overlapping with the iPhone status bar.

### Build Profiles (eas.json)
- **development:** For testing builds
- **preview:** For internal testing/TestFlight
- **production:** For App Store/Google Play submission

### Previous Build Issues (FYI)
The project previously had issues with:
- ReactCommon module redefinition errors in SDK 50, 51, 52
- Git lock files blocking EAS uploads
- These should be resolved, but if you encounter them, delete `.git/index.lock` files

## Required Client Information

Before building, ask the client for:

1. **EXPO_TOKEN** - Required for non-interactive builds
   - They can get this from their Expo account settings

2. **Apple Developer Account Access** (for iOS)
   - Already configured in their EAS project
   - Team ID: P7PW224G4Y

3. **Google Play Console Access** (for Android)
   - They'll need to provide a keystore or let EAS generate one

## Deployment Checklist

### iOS App Store
- [ ] Build complete (.ipa file downloaded)
- [ ] Upload to App Store Connect
- [ ] Configure app metadata (screenshots, description, etc.)
- [ ] Submit for review

### Google Play Store
- [ ] Build complete (.aab file downloaded)
- [ ] Upload to Google Play Console
- [ ] Configure app metadata (screenshots, description, etc.)
- [ ] Submit for review

## Common Commands

```bash
# Login to Expo account
npx eas-cli login

# Check build status
npx eas-cli build:list

# View project info
npx eas-cli project:info

# Submit to app stores
npx eas-cli submit --platform ios
npx eas-cli submit --platform android
```

## Support

If you encounter issues:
1. Check EAS Build documentation: https://docs.expo.dev/build/introduction/
2. Verify the client's Apple/Google credentials are valid
3. Ensure EXPO_TOKEN is set correctly

## Important: No Secrets Included

This export does NOT include:
- .env files
- API keys
- EXPO_TOKEN
- Any sensitive credentials

The client will need to provide these separately.

---

**Client:** Bradley Wessling (@wesso80)  
**Project Created:** November 2025  
**Expo Account:** @wesso80/market-scanner-pro
