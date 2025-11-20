# Market Scanner Pro - iOS App Store Build Guide

## ✅ What's Ready

Your Capacitor app is configured and ready to build! It will load your Market Scanner Pro web app (https://app.marketscannerpros.app) in a native iOS wrapper.

**Key Info:**
- App Name: Market Scanner Pro
- Bundle ID: `app.marketscannerpros`
- Loads: Your live Streamlit app

---

## 📋 Requirements

To build for the App Store, you need:

1. ✅ **Mac computer** (required for iOS builds)
2. ✅ **Xcode 15+** (free from Mac App Store)
3. ✅ **Apple Developer Account** ($99/year)
   - Sign up: https://developer.apple.com/programs/

---

## 🚀 Build Steps (On Your Mac)

### **Step 1: Download Project**

Download the entire `capacitor-app` folder from Replit to your Mac.

### **Step 2: Install Dependencies**

```bash
cd capacitor-app
npm install
```

### **Step 3: Add iOS Platform**

```bash
npx cap add ios
```

This creates the `ios/` folder with your Xcode project.

### **Step 4: Open in Xcode**

```bash
npx cap open ios
```

Xcode will open your project.

### **Step 5: Configure in Xcode**

1. **Select your team:**
   - Click on "App" in the left sidebar
   - Under "Signing & Capabilities"
   - Select your Apple Developer team

2. **Add app icons:**
   - Click "App" → "Assets" → "AppIcon"
   - Drag your 1024×1024 icon image

3. **Set deployment target:**
   - General → Deployment Info → iOS 13.0 or higher

### **Step 6: Build for App Store**

1. In Xcode menu: **Product** → **Archive**
2. Wait for build to complete (5-10 minutes)
3. When done, click **Distribute App**
4. Select **App Store Connect**
5. Follow the wizard to upload

---

## 📱 Testing Before Submission

### **Test on Simulator:**

```bash
npx cap run ios
```

### **Test on Physical iPhone:**

1. Connect iPhone via USB
2. In Xcode, select your device from the device dropdown
3. Click the Play (▶) button
4. App installs and runs on your phone

---

## 🎨 App Icons & Splash Screen

### **App Icon (Required):**

Create a 1024×1024 PNG image:
- No transparency
- Square corners (iOS adds rounded corners automatically)
- High resolution

Save to: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`

### **Splash Screen (Optional):**

Edit `capacitor.config.json` to customize:

```json
{
  "plugins": {
    "SplashScreen": {
      "launchAutoHide": true,
      "backgroundColor": "#ffffff"
    }
  }
}
```

---

## 🔧 Common Issues

### **"No Development Team" Error**

**Fix:** Add your Apple ID in Xcode:
1. Xcode → Settings → Accounts
2. Click "+" → Add Apple ID
3. Sign in with your Apple Developer account

### **"Provisioning Profile" Error**

**Fix:** Xcode will create automatically if you've:
1. Selected your team
2. Registered bundle ID in Apple Developer portal

### **App Loads Blank Screen**

**Fix:** Check that your web app URL is accessible:
- Test in Safari: https://app.marketscannerpros.app
- Ensure it loads correctly

---

## 📝 App Store Submission Checklist

Before submitting to Apple:

- [ ] Test on real iPhone device
- [ ] Add app icon (1024×1024)
- [ ] Create screenshots (required sizes)
- [ ] Write app description
- [ ] Set privacy policy URL
- [ ] Complete App Store Connect listing
- [ ] Submit for review

**App Store Review Time:** 24-48 hours typically

---

## 🆚 Why Capacitor vs Expo?

**Capacitor Benefits:**
- ✅ No ReactCommon errors (doesn't use React Native)
- ✅ Direct Xcode control
- ✅ Simpler for web app wrappers
- ✅ Builds reliably every time

**Trade-off:**
- ⚠️ Must build on Mac (no cloud builds like Expo EAS)

---

## 📚 Resources

- [Capacitor iOS Guide](https://capacitorjs.com/docs/ios)
- [Apple Developer Portal](https://developer.apple.com/)
- [App Store Connect](https://appstoreconnect.apple.com/)
- [Xcode Download](https://apps.apple.com/us/app/xcode/id497799835)

---

## 🎯 Quick Command Reference

```bash
# Install dependencies
npm install

# Add iOS platform
npx cap add ios

# Sync web app changes
npx cap sync

# Open in Xcode
npx cap open ios

# Run on simulator
npx cap run ios
```

---

## ✨ Your App is Ready!

The hard part (configuration) is done. Now just:
1. Download to your Mac
2. Follow steps above
3. Submit to App Store

**No more ReactCommon errors!** 🎉
