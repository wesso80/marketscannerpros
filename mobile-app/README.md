# Market Scanner Pro - Mobile App

This is a React Native/Expo wrapper for the Market Scanner Pro web application. It allows the Streamlit web app to be published on the Apple App Store and Google Play Store.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Expo CLI: `npm install -g expo-cli eas-cli`
- Apple Developer Account ($99/year) for iOS
- Google Play Developer Account ($25 one-time) for Android

### Installation

```bash
cd mobile-app
npm install
```

### Development

```bash
# Start Expo development server
npm start

# Run on iOS simulator (Mac only)
npm run ios

# Run on Android emulator
npm run android

# Test in web browser
npm run web
```

## 📱 Building for Production

### iOS (Apple App Store)

1. **Create App in App Store Connect**
   - Go to https://appstoreconnect.apple.com
   - Create new app with Bundle ID: `com.marketscannerpro.app`
   - Fill in app metadata, screenshots, description

2. **Configure EAS**
   ```bash
   eas login
   eas build:configure
   ```

3. **Update `eas.json`** with your Apple credentials:
   - `appleId`: Your Apple ID email
   - `ascAppId`: App Store Connect App ID
   - `appleTeamId`: Your Apple Developer Team ID

4. **Build iOS App**
   ```bash
   eas build --platform ios --profile production
   ```

5. **Submit to App Store**
   ```bash
   eas submit --platform ios --profile production
   ```

### Android (Google Play Store)

1. **Create App in Google Play Console**
   - Go to https://play.google.com/console
   - Create new app with Package Name: `com.marketscannerpro.app`
   - Fill in app details and store listing

2. **Create Service Account Key**
   - Follow: https://docs.expo.dev/submit/android/
   - Download JSON key file
   - Save as `google-play-service-account.json` (DO NOT commit!)

3. **Build Android App**
   ```bash
   eas build --platform android --profile production
   ```

4. **Submit to Google Play**
   ```bash
   eas submit --platform android --profile production
   ```

## 🎨 Assets Needed

Before submitting to stores, you need:

### iOS Requirements
- **App Icon**: 1024x1024px PNG (no transparency)
- **Screenshots**:
  - iPhone 6.7" (1290x2796px) - 3 screenshots minimum
  - iPhone 6.5" (1242x2688px) - 3 screenshots minimum
  - iPad Pro 12.9" (2048x2732px) - optional

### Android Requirements
- **App Icon**: 512x512px PNG
- **Feature Graphic**: 1024x500px PNG
- **Screenshots**:
  - Phone: 320-3840px (min width)
  - Tablet: 1200-7680px (min width)
  - At least 2 screenshots required

### Generate Icons
Replace the placeholder icons in `assets/` with your actual app icons:
- `icon.png` - 1024x1024px
- `adaptive-icon.png` - 1024x1024px (Android)
- `splash.png` - 1284x2778px
- `favicon.png` - 48x48px

## 📝 App Store Listing

### App Name
Market Scanner Pro

### Subtitle (iOS)
Real-Time Market Analysis & Trading Scanner

### Short Description (Android, 80 chars)
Scan markets with AI-powered technical analysis. Track trades & price alerts.

### Full Description
Market Scanner Pro is your comprehensive trading companion, providing real-time market analysis across equities, cryptocurrencies, and commodities.

**KEY FEATURES:**
✓ Real-time market scanning with technical indicators
✓ Portfolio tracking with performance analytics
✓ Price alerts with notifications
✓ AI-powered trade journal with P&L tracking
✓ Backtesting capabilities
✓ TradingView webhook integration
✓ Multi-asset support (stocks, crypto, commodities)

**TECHNICAL ANALYSIS:**
• Moving Averages (EMA 8, 21, 50, 200)
• RSI, MACD, ATR indicators
• Volume analysis
• Bollinger Bands
• Custom scanner settings

**PORTFOLIO & JOURNAL:**
• Track positions across multiple assets
• Calculate P&L automatically
• Options, futures, and margin support
• Export trade history to CSV

**ALERTS & NOTIFICATIONS:**
• Set price targets and alerts
• Slack integration
• Real-time market notifications

All features are completely free with no tier restrictions.

### Keywords (iOS, comma-separated, 100 chars max)
trading,stocks,crypto,scanner,alerts,portfolio,technical analysis,market

### Category
- iOS: Finance
- Android: Finance

### Age Rating
- iOS: 4+ (No objectionable content)
- Android: Everyone

### Privacy Policy URL
https://marketscannerpros.app/privacy

### Support URL
https://marketscannerpros.app/support

## 🔧 Configuration

### Update App URL
Edit `App.js` and change the `APP_URL` constant if your web app URL changes:
```javascript
const APP_URL = 'https://app.marketscannerpros.app';
```

### Update Bundle Identifiers
If you need different bundle IDs, update in `app.json`:
- iOS: `expo.ios.bundleIdentifier`
- Android: `expo.android.package`

## 📊 Analytics & Monitoring

Consider adding:
- Firebase Analytics
- Sentry for error tracking
- App Store analytics in App Store Connect
- Google Play Console analytics

## 🛡️ Security Notes

- Never commit `google-play-service-account.json`
- Never commit `.p12`, `.p8`, or `.mobileprovision` files
- Keep your Apple Developer credentials secure
- Use environment variables for sensitive data

## 📞 Support

For issues or questions:
- Web app: https://marketscannerpros.app
- Email: support@marketscannerpros.app

## 📄 License

Copyright © 2025 Market Scanner Pro. All rights reserved.
