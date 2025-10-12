# iOS Build Instructions

## The Problem
EAS CLI cannot build from Replit due to Node.js TypeScript module loading issues with expo-modules-core.

## Solution: Build from Your Local Mac

### Prerequisites
- Mac with Xcode installed
- EAS CLI: `npm install -g eas-cli`
- Expo account (login with: `eas login`)

### Steps

1. **Clone/Download this project to your Mac**
   ```bash
   # Download project files to your local machine
   ```

2. **Install dependencies**
   ```bash
   cd marketscanner-mobile
   npm install
   ```

3. **Build for iOS**
   ```bash
   eas build --platform ios --profile production
   ```

4. **Submit to TestFlight**
   ```bash
   eas submit --platform ios --latest
   ```

### App Store Connect Checklist
Before submitting, verify in App Store Connect:

✅ **Product 1: Pro Plan**
- Product ID: `com.wesso80.marketscanners.proplan.monthly`
- Price: $4.99/month
- Trial: 7 days
- Status: Ready to Submit

✅ **Product 2: Pro Trader**  
- Product ID: `com.wesso80.marketscanners.protrader.monthly`
- Price: $9.99/month
- Trial: 5 days
- Status: Ready to Submit

### Build Info
- Bundle ID: com.wesso80.marketscannermobile
- Build Number: 3
- Version: 1.0.1
- IAP Plugin: expo-in-app-purchases (configured)

The app is ready for submission - it just needs to be built from a compatible environment.
