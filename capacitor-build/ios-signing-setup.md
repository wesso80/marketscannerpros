# 🍎 iOS App Signing & Distribution Setup

## Prerequisites
- macOS with Xcode installed
- Apple Developer Account ($99/year)
- Valid Apple ID

## Setup Developer Account
1. Visit [Apple Developer](https://developer.apple.com)
2. Enroll in Apple Developer Program
3. Accept latest Developer Agreement

## Configure Xcode Signing
```bash
cd capacitor-build
npx cap open ios
```

### In Xcode:
1. **Select Target**: Click "Market Scanner Pro" in project navigator
2. **Signing & Capabilities Tab**:
   - Team: Select your developer team
   - Bundle Identifier: `com.marketscanner.pro`
   - Check "Automatically manage signing"
3. **App Icon**: Verify app icons are loaded
4. **Info.plist**: Check Display Name and Bundle Name

## App Store Preparation

### 1. Archive for Distribution
- Product → Archive
- Window → Organizer
- Select archive → Distribute App
- App Store Connect → Next

### 2. App Store Connect Setup
1. Create app at [App Store Connect](https://appstoreconnect.apple.com)
2. App Information:
   - Name: Market Scanner Pro  
   - Bundle ID: com.marketscanner.pro
   - SKU: market-scanner-pro-001
   - Primary Language: English
3. Pricing: Free or paid
4. App Review Information:
   - Demo account (if needed)
   - Review notes about web content

### 3. Required Store Assets
- App Icon: 1024x1024px
- Screenshots: Various device sizes
- App Preview: Optional video
- App Description
- Keywords
- Privacy Policy URL ⚠️ **Required**

## Important Notes
⚠️ **WebView App Considerations**:
- Apple may reject pure WebView apps
- Consider adding native features:
  - Push notifications
  - File system access
  - Camera/photo integration
  - Share extensions
- Or deploy as PWA instead

## Testing
```bash
# Test on simulator
npx cap run ios

# Test on device
npx cap run ios --target [device-id]
```

## Troubleshooting
- **CocoaPods Error**: `sudo gem install cocoapods`
- **Signing Error**: Check Apple Developer account status
- **Archive Error**: Clean build folder (Product → Clean)
- **App Store Rejection**: Add native capabilities or deploy as PWA