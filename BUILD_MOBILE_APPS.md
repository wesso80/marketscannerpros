# 📱 Market Scanner - Mobile App Build Guide

## 🎯 Overview
Your Market Scanner is ready for mobile app distribution! This guide covers building native Android and iOS apps from your Replit project.

## ✅ Current Status
- 🌐 **Web App**: Running live at https://market-scanner-1-wesso80.replit.app
- 📱 **Expo App**: Available for instant testing via QR code
- 🤖 **Android Project**: Generated and configured with Capacitor
- 🍎 **iOS Project**: Generated and configured with Capacitor
- 🔗 **Native Apps**: Connected to your live Replit backend

---

## 🚀 Quick Test (Immediate)

### Expo Go Testing
1. Install **Expo Go** on your phone:
   - [Android Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)
   - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)

2. Scan the QR code from your **Mobile App workflow** in Replit
3. Your Market Scanner app opens instantly on your device!

---

## 🏗️ Building Native Apps

### Requirements for Building
- **Android**: Android Studio + Android SDK
- **iOS**: macOS with Xcode
- **Both**: Node.js 16+ installed locally

### 1. Download Project Files
Download your entire Replit project or clone it locally:
```bash
git clone [your-replit-git-url]
cd [your-project]
```

### 2. Install Dependencies
```bash
cd capacitor-build
npm install
```

---

## 🤖 Android App Build

### Setup Android Studio
1. Install [Android Studio](https://developer.android.com/studio)
2. Install Android SDK (API level 33+)
3. Set ANDROID_HOME environment variable

### Build APK (Debug)
```bash
cd capacitor-build
npx cap sync android
cd android
./gradlew assembleDebug
```

### Build APK (Release)
```bash
cd android
./gradlew assembleRelease
```

### Build AAB for Google Play
```bash
cd android
./gradlew bundleRelease
```

### Install on Device
```bash
# Debug APK location
android/app/build/outputs/apk/debug/app-debug.apk

# Release APK location  
android/app/build/outputs/apk/release/app-release.apk

# AAB for Google Play
android/app/build/outputs/bundle/release/app-release.aab
```

---

## 🍎 iOS App Build

### Setup Xcode
1. Install [Xcode](https://apps.apple.com/app/xcode/id497799835) (macOS only)
2. Install Xcode command line tools
3. Install CocoaPods: `sudo gem install cocoapods`

### Build iOS App
```bash
cd capacitor-build
npx cap sync ios
npx cap open ios  # Opens Xcode
```

### In Xcode:
1. **Sign the app**: Select your developer team
2. **Build for device**: Product → Archive
3. **Distribute**: Distribute App → App Store Connect

### Build for Testing
```bash
# Build for simulator
npx cap run ios

# Build for device
npx cap run ios --target [device-id]
```

---

## 📚 App Store Distribution

### Google Play Store (Android)
1. Create [Google Play Console](https://play.google.com/console) account
2. Upload signed AAB file (`app-release.aab`)
3. Fill app listing information
4. Submit for review

### Apple App Store (iOS)
1. Create [App Store Connect](https://appstoreconnect.apple.com) account  
2. Archive app in Xcode
3. Upload to App Store Connect
4. Fill app metadata
5. Submit for review

---

## 🔧 App Configuration

### Icons & Assets
Your app icons are configured and ready:
- `icon-192.png`
- `icon-512.png` 
- `icon-512-maskable.png`
- `icon-512-monochrome.png`

### App Details
- **Name**: Market Scanner Pro
- **Bundle ID**: com.marketscanner.pro
- **Version**: 1.0.0
- **URL**: https://market-scanner-1-wesso80.replit.app

⚠️ **IMPORTANT**: This app loads web content from your Replit URL. For App Store approval:
- Consider adding native features (notifications, file access, etc.)
- Or deploy as a PWA instead of native app
- Ensure stable custom domain for production

### Features
- 📊 Real-time market scanning (requires internet)
- 📈 Advanced charting (web-based)
- 💰 Portfolio tracking 
- 🔔 Price alerts (web notifications)
- 📱 Mobile-optimized web interface

---

## 🐛 Troubleshooting

### Common Issues
1. **Gradle build fails**: Ensure ANDROID_HOME is set
2. **iOS build fails**: Check Xcode signing settings
3. **App crashes**: Check Capacitor config URL is correct
4. **Network issues**: Verify CORS settings on backend

### Support
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Android Studio Guide](https://developer.android.com/studio/intro)
- [Xcode Documentation](https://developer.apple.com/documentation/xcode)

---

## 🎉 Success!
Once built, your Market Scanner mobile apps will:
- ✅ Connect to your live Replit backend
- ✅ Display your web application in native wrapper
- ✅ Install like native apps from device storage
- ✅ Run on iOS and Android devices
- ✅ Available on app stores (after review approval)

**Your Market Scanner mobile setup is complete and ready for external builds!** 🚀