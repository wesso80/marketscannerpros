# Market Scanner Pro - Mobile App

Expo/React Native app that loads your Market Scanner Pro web application.

## 📱 App Configuration

- **App Name:** Market Scanner Pro
- **Bundle ID:** app.marketscannerpros
- **Web App URL:** https://app.marketscannerpros.app

## 🚀 Build for iOS with EAS

### Prerequisites

1. Install EAS CLI:
```bash
npm install -g eas-cli
```

2. Login to your Expo account:
```bash
eas login
```

3. Configure EAS project:
```bash
cd mobile-app
eas build:configure
```

### Build iOS App

```bash
# Production build for App Store
eas build --platform ios --profile production

# Preview build for testing
eas build --platform ios --profile preview
```

### Build Android App

```bash
# Production build
eas build --platform android --profile production
```

## 📋 Submit to App Store

After successful build:

```bash
eas submit --platform ios
```

You'll need:
- Apple Developer account ($99/year)
- App Store Connect account

## 🧪 Local Development

```bash
npm install
npx expo start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator  
- Scan QR code with Expo Go app on physical device

## 📝 Notes

- App loads your live web app at https://app.marketscannerpros.app
- Uses Expo SDK 50 for stability
- WebView-based (wraps your Streamlit app)
