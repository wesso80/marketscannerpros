# Quick Start - Market Scanner Pro Mobile App

Your app is configured with:
- **iOS Bundle ID**: `app.marketscannerpros`
- **Android Package**: `app.marketscannerpros`
- **App URL**: `https://app.marketscannerpros.app`

## 🚀 Build & Submit to App Store

### Step 1: Install Dependencies
```bash
cd mobile-app
npm install
```

### Step 2: Login to Expo
```bash
npx expo login
```

### Step 3: Test Locally (Optional)
```bash
npx expo start
# Scan QR code with Expo Go app on your phone
```

### Step 4: Configure EAS
```bash
npx eas build:configure
```

### Step 5: Build for iOS
```bash
npx eas build -p ios
```

**When prompted:**
- ✅ Choose: "Let Expo handle credentials"
- ✅ This will create signing certificates automatically

**Build takes 10-20 minutes** ☕

### Step 6: Submit to TestFlight
```bash
npx eas submit -p ios
```

**You'll need:**
- Your Apple ID email
- App-specific password (create at appleid.apple.com)

---

## 📋 Before Building - Checklist

### ✅ In Apple Developer (developer.apple.com)
- [ ] Bundle ID registered: `app.marketscannerpros`

### ✅ In App Store Connect (appstoreconnect.apple.com)
- [ ] App created with same Bundle ID
- [ ] App name: "Market Scanner Pro"
- [ ] Screenshots ready (3+ per device size)
- [ ] App description written
- [ ] Privacy policy URL added

### ✅ Assets Needed
- [ ] App icon (1024x1024px PNG) → Replace `assets/icon.png`
- [ ] Splash screen (1284x2778px PNG) → Replace `assets/splash.png`

**Don't have icons yet?** Temporary placeholder:
```bash
# Create simple placeholder icon (requires ImageMagick)
cd assets
convert -size 1024x1024 xc:#0066cc \
  -font Arial -pointsize 200 -fill white \
  -gravity center -annotate +0+0 'MSP' \
  icon.png
```

Or use Canva/Figma to design properly!

---

## 🔧 Troubleshooting

### Build fails?
```bash
# Check detailed logs
npx eas build -p ios --profile production --clear-cache
```

### Bundle ID mismatch?
Make sure `app.marketscannerpros` matches:
1. In `app.json` ✅ (already fixed!)
2. In Apple Developer portal
3. In App Store Connect

### TestFlight not showing?
- Check App Store Connect → TestFlight tab
- Build processing takes 5-10 minutes after upload

---

## 📞 Next Steps After Build

1. **TestFlight** appears → Test on real iPhone
2. **Test works** → Submit for App Store review
3. **Review approved** → App goes live! 🎉

Build time: Usually 1-3 days for Apple review
