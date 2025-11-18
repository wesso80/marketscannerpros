# Step-by-Step Build Instructions

This guide will walk you through building and submitting Market Scanner Pro to the Apple App Store and Google Play Store.

## 📋 Prerequisites

### Required Accounts

1. **Apple Developer Account** - $99/year
   - Sign up: https://developer.apple.com/programs/
   - Wait for enrollment approval (1-2 days)

2. **Google Play Developer Account** - $25 one-time
   - Sign up: https://play.google.com/console/signup
   - Instant activation after payment

3. **Expo Account** - Free
   - Sign up: https://expo.dev/signup

### Required Software

```bash
# Install Node.js (18+)
# Download from: https://nodejs.org/

# Verify installation
node --version  # Should show v18 or higher
npm --version

# Install Expo CLI globally
npm install -g expo-cli eas-cli

# Verify Expo CLI
expo --version
eas --version
```

## 🚀 Part 1: Initial Setup

### Step 1: Install Dependencies

```bash
cd mobile-app
npm install
```

### Step 2: Test Locally

```bash
# Start development server
npm start

# Scan QR code with Expo Go app on your phone
# iOS: Download "Expo Go" from App Store
# Android: Download "Expo Go" from Play Store
```

### Step 3: Login to Expo

```bash
eas login
# Enter your Expo credentials
```

### Step 4: Configure Project

```bash
eas build:configure
# Select "All" when asked which platforms
```

This creates/updates `eas.json` with build configurations.

## 🍎 Part 2: iOS Build & Submission

### Step 1: Create App in App Store Connect

1. Go to https://appstoreconnect.apple.com
2. Click "My Apps" → "+" → "New App"
3. Fill in:
   - **Platform**: iOS
   - **Name**: Market Scanner Pro
   - **Primary Language**: English
   - **Bundle ID**: Select `com.marketscannerpro.app` (you'll need to register this in Apple Developer portal first)
   - **SKU**: MKTSCANNER001 (or any unique ID)

### Step 2: Register Bundle ID

1. Go to https://developer.apple.com/account/resources/identifiers/list
2. Click "+" to add new identifier
3. Select "App IDs" → Continue
4. Select "App" → Continue
5. Fill in:
   - **Description**: Market Scanner Pro
   - **Bundle ID**: `com.marketscannerpro.app`
6. Click "Continue" → "Register"

### Step 3: Update eas.json with Apple Credentials

Edit `mobile-app/eas.json`:

```json
{
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@email.com",
        "ascAppId": "1234567890",  // Find in App Store Connect
        "appleTeamId": "AB12CD34EF"  // Find in Apple Developer account
      }
    }
  }
}
```

**To find your IDs:**
- **appleId**: Your Apple ID email
- **ascAppId**: In App Store Connect → App → App Information → Apple ID
- **appleTeamId**: https://developer.apple.com/account → Membership → Team ID

### Step 4: Build iOS App

```bash
cd mobile-app
eas build --platform ios --profile production
```

**This will:**
- Ask for Apple credentials (first time only)
- Generate signing certificates automatically
- Build the app on Expo's servers (takes 10-20 minutes)
- Provide a download link when complete

### Step 5: Prepare App Store Listing

While the build is running, prepare your App Store Connect listing:

1. **App Information**:
   - Name: Market Scanner Pro
   - Subtitle: Real-Time Market Analysis & Trading
   - Privacy Policy URL: https://marketscannerpros.app/privacy

2. **Screenshots** (required):
   - Take screenshots of your app running in iOS simulator
   - Use Expo Go app on a real iPhone to get authentic screenshots
   - Required sizes:
     - 6.7" iPhone: 1290x2796px (3+ screenshots)
     - 6.5" iPhone: 1242x2688px (3+ screenshots)

3. **Description**:
   ```
   Market Scanner Pro provides real-time market analysis across equities, cryptocurrencies, and commodities.

   KEY FEATURES:
   ✓ Real-time market scanning
   ✓ Portfolio tracking
   ✓ Price alerts
   ✓ AI-powered trade journal
   ✓ Backtesting capabilities
   ✓ TradingView integration

   All features completely free!
   ```

4. **Keywords**: `trading, stocks, crypto, scanner, alerts, portfolio, analysis`

5. **Category**: Finance

6. **Age Rating**: 4+

### Step 6: Submit to App Store

```bash
eas submit --platform ios --profile production
```

**This will:**
- Upload the build to App Store Connect
- Submit for review automatically

**OR** manually upload:
1. Download IPA file from EAS build
2. Use Transporter app to upload to App Store Connect
3. Submit for review in App Store Connect

### Step 7: Wait for Review

- Apple typically reviews in 24-48 hours
- Check status in App Store Connect
- Respond to any rejection reasons promptly

## 🤖 Part 3: Android Build & Submission

### Step 1: Create App in Google Play Console

1. Go to https://play.google.com/console
2. Click "Create app"
3. Fill in:
   - **App name**: Market Scanner Pro
   - **Default language**: English (United States)
   - **App or game**: App
   - **Free or paid**: Free
4. Accept declarations and click "Create app"

### Step 2: Set Up Store Listing

1. **App details**:
   - **App name**: Market Scanner Pro
   - **Short description**: Scan markets with AI-powered technical analysis
   - **Full description**: (Same as iOS, see above)

2. **Category**: Finance

3. **Contact details**:
   - Email: support@marketscannerpros.app
   - Website: https://marketscannerpros.app

4. **Privacy Policy**: https://marketscannerpros.app/privacy

### Step 3: Upload Graphics

Required assets:
- **App icon**: 512x512px PNG
- **Feature graphic**: 1024x500px JPG/PNG
- **Phone screenshots**: 2+ screenshots (min 320px wide)

### Step 4: Content Rating

1. Go to "Content rating" section
2. Fill out questionnaire (should be "Everyone")
3. Submit for rating

### Step 5: Create Service Account for Automated Submission

1. Go to Google Cloud Console: https://console.cloud.google.com/
2. Select project or create new one
3. Enable "Google Play Android Developer API"
4. Create service account:
   - IAM & Admin → Service Accounts → Create
   - Name: "expo-play-store"
   - Grant role: "Service Account User"
5. Create JSON key:
   - Click on service account
   - Keys → Add Key → Create new key → JSON
   - Download and save as `google-play-service-account.json`
6. Grant access in Play Console:
   - Users and permissions → Invite new users
   - Enter service account email
   - Grant "Admin" access

### Step 6: Build Android App

```bash
cd mobile-app
eas build --platform android --profile production
```

**This will:**
- Build APK on Expo servers (10-20 minutes)
- Provide download link when complete

### Step 7: Submit to Google Play

```bash
eas submit --platform android --profile production
```

**This will:**
- Upload APK to Play Console
- Submit to "Internal testing" track by default

### Step 8: Promote to Production

1. Go to Play Console → Testing → Internal testing
2. Review the release
3. Click "Promote release" → "Production"
4. Click "Start rollout to Production"

Android apps are typically published within a few hours!

## 🎉 You're Done!

Your app is now submitted to both stores. Here's what happens next:

### iOS Timeline
- ⏱️ **Review**: 1-3 days
- ✅ **Approved**: App goes live immediately
- ❌ **Rejected**: Fix issues and resubmit

### Android Timeline
- ⏱️ **Review**: Few hours
- ✅ **Published**: Live in Play Store
- 📱 **Rollout**: Can control percentage of users

## 🔄 Updating Your App

When you make changes:

1. **Update version** in `app.json`:
   ```json
   {
     "version": "1.0.1",
     "ios": {
       "buildNumber": "2"
     },
     "android": {
       "versionCode": 2
     }
   }
   ```

2. **Rebuild**:
   ```bash
   eas build --platform all --profile production
   ```

3. **Resubmit**:
   ```bash
   eas submit --platform all --profile production
   ```

## ❓ Troubleshooting

### Build Fails
- Check `eas build --platform ios --profile production` logs
- Common issues: Expired certificates, wrong bundle ID

### iOS Rejection
- Most common: App too simple (just a web wrapper)
- Solution: Add native features or better app description

### Android Upload Fails
- Check service account permissions
- Verify `google-play-service-account.json` is correct

### App Crashes
- Test with `expo start` first
- Check web app URL is correct in `App.js`
- Ensure HTTPS (not HTTP)

## 📞 Get Help

- **Expo Docs**: https://docs.expo.dev/
- **Expo Forums**: https://forums.expo.dev/
- **Stack Overflow**: Tag questions with `expo` and `react-native`
